const { EventEmitter } = require('events')
const STREAM_DESTROYED = new Error('Stream was destroyed')

const FIFO = require('fast-fifo')

/* eslint-disable no-multi-spaces */

const MAX = ((1 << 25) - 1)

// Shared state
const OPENING     = 0b001
const DESTROYING  = 0b010
const DESTROYED   = 0b100

const NOT_OPENING = MAX ^ OPENING

// Read state
const READ_ACTIVE           = 0b0000000000001 << 3
const READ_PRIMARY          = 0b0000000000010 << 3
const READ_SYNC             = 0b0000000000100 << 3
const READ_QUEUED           = 0b0000000001000 << 3
const READ_RESUMED          = 0b0000000010000 << 3
const READ_PIPE_DRAINED     = 0b0000000100000 << 3
const READ_ENDING           = 0b0000001000000 << 3
const READ_EMIT_DATA        = 0b0000010000000 << 3
const READ_EMIT_READABLE    = 0b0000100000000 << 3
const READ_EMITTED_READABLE = 0b0001000000000 << 3
const READ_DONE             = 0b0010000000000 << 3
const READ_NEXT_TICK        = 0b0100000000001 << 3 // also active
const READ_NEEDS_PUSH       = 0b1000000000000 << 3

const READ_NOT_ACTIVE             = MAX ^ READ_ACTIVE
const READ_NON_PRIMARY            = MAX ^ READ_PRIMARY
const READ_NON_PRIMARY_AND_PUSHED = MAX ^ (READ_PRIMARY | READ_NEEDS_PUSH)
const READ_NOT_SYNC               = MAX ^ READ_SYNC
const READ_PUSHED                 = MAX ^ READ_NEEDS_PUSH
const READ_PAUSED                 = MAX ^ READ_RESUMED
const READ_NOT_QUEUED             = MAX ^ (READ_QUEUED | READ_EMITTED_READABLE)
const READ_NOT_ENDING             = MAX ^ READ_ENDING
const READ_PIPE_NOT_DRAINED       = MAX ^ (READ_RESUMED | READ_PIPE_DRAINED)
const READ_NOT_NEXT_TICK          = MAX ^ READ_NEXT_TICK

// Write state
const WRITE_ACTIVE     = 0b000000001 << 16
const WRITE_PRIMARY    = 0b000000010 << 16
const WRITE_SYNC       = 0b000000100 << 16
const WRITE_QUEUED     = 0b000001000 << 16
const WRITE_UNDRAINED  = 0b000010000 << 16
const WRITE_DONE       = 0b000100000 << 16
const WRITE_EMIT_DRAIN = 0b001000000 << 16
const WRITE_NEXT_TICK  = 0b010000001 << 16 // also active
const WRITE_FINISHING  = 0b100000000 << 16

const WRITE_NOT_ACTIVE    = MAX ^ WRITE_ACTIVE
const WRITE_NOT_SYNC      = MAX ^ WRITE_SYNC
const WRITE_NON_PRIMARY   = MAX ^ WRITE_PRIMARY
const WRITE_NOT_FINISHING = MAX ^ WRITE_FINISHING
const WRITE_DRAINED       = MAX ^ (WRITE_UNDRAINED | WRITE_QUEUED)
const WRITE_NOT_NEXT_TICK = MAX ^ WRITE_NEXT_TICK

// Combined shared state
const ACTIVE = READ_ACTIVE | WRITE_ACTIVE
const NOT_ACTIVE = MAX ^ ACTIVE
const DONE = READ_DONE | WRITE_DONE
const DESTROY_STATUS = DESTROYING | DESTROYED
const OPEN_STATUS = DESTROY_STATUS | OPENING
const AUTO_DESTROY = DESTROY_STATUS | DONE
const NON_PRIMARY = WRITE_NON_PRIMARY & READ_NON_PRIMARY

// Combined read state
const READ_PRIMARY_STATUS = OPEN_STATUS | READ_ENDING | READ_DONE
const READ_STATUS = OPEN_STATUS | READ_DONE | READ_QUEUED
const READ_FLOWING = READ_RESUMED | READ_PIPE_DRAINED
const READ_ACTIVE_AND_SYNC = READ_ACTIVE | READ_SYNC
const READ_ACTIVE_AND_SYNC_AND_NEEDS_PUSH = READ_ACTIVE | READ_SYNC | READ_NEEDS_PUSH
const READ_PRIMARY_AND_ACTIVE = READ_PRIMARY | READ_ACTIVE
const READ_ENDING_STATUS = OPEN_STATUS | READ_ENDING | READ_QUEUED
const READ_EMIT_READABLE_AND_QUEUED = READ_EMIT_READABLE | READ_QUEUED
const READ_READABLE_STATUS = OPEN_STATUS | READ_EMIT_READABLE | READ_QUEUED | READ_EMITTED_READABLE
const SHOULD_NOT_READ = OPEN_STATUS | READ_ACTIVE | READ_ENDING | READ_DONE | READ_NEEDS_PUSH

// Combined write state
const WRITE_PRIMARY_STATUS = OPEN_STATUS | WRITE_FINISHING | WRITE_DONE
const WRITE_QUEUED_AND_UNDRAINED = WRITE_QUEUED | WRITE_UNDRAINED
const WRITE_NEEDS_EMIT_DRAIN = WRITE_UNDRAINED | WRITE_EMIT_DRAIN
const WRITE_STATUS = OPEN_STATUS | WRITE_ACTIVE | WRITE_QUEUED
const WRITE_PRIMARY_AND_ACTIVE = WRITE_PRIMARY | WRITE_ACTIVE
const WRITE_ACTIVE_AND_SYNC = WRITE_ACTIVE | WRITE_SYNC
const WRITE_FINISHING_STATUS = OPEN_STATUS | WRITE_FINISHING | WRITE_QUEUED

const asyncIterator = Symbol.asyncIterator || Symbol('asyncIterator')

class WritableState {
  constructor (stream, { highWaterMark = 16384, map = null, mapWritable, byteLength, byteLengthWritable } = {}) {
    this.stream = stream
    this.queue = new FIFO()
    this.highWaterMark = highWaterMark
    this.buffered = 0
    this.error = null
    this.pipeline = null
    this.byteLength = byteLengthWritable || byteLength || defaultByteLength
    this.map = mapWritable || map
    this.afterWrite = afterWrite.bind(this)
  }

  push (data) {
    if (this.map !== null) data = this.map(data)

    this.buffered += this.byteLength(data)
    this.queue.push(data)

    if (this.buffered < this.highWaterMark) {
      this.stream._duplexState |= WRITE_QUEUED
      return true
    }

    this.stream._duplexState |= WRITE_QUEUED_AND_UNDRAINED
    return false
  }

  shift () {
    const data = this.queue.shift()
    const stream = this.stream

    this.buffered -= this.byteLength(data)

    if (this.buffered === 0) {
      if ((stream._duplexState & WRITE_NEEDS_EMIT_DRAIN) !== 0) {
        stream._duplexState &= WRITE_DRAINED
        stream.emit('drain')
      } else {
        stream._duplexState &= WRITE_DRAINED
      }
    }

    return data
  }

  end (data) {
    if (data !== undefined && data !== null) this.push(data)
    this.stream._duplexState = (this.stream._duplexState | WRITE_FINISHING) & WRITE_NON_PRIMARY
  }

  update () {
    const stream = this.stream

    while ((stream._duplexState & WRITE_STATUS) === WRITE_QUEUED) {
      const data = this.shift()
      stream._duplexState |= WRITE_ACTIVE_AND_SYNC
      stream._write(data, this.afterWrite)
      stream._duplexState &= WRITE_NOT_SYNC
    }

    if ((stream._duplexState & WRITE_PRIMARY_AND_ACTIVE) === 0) this.updateNonPrimary()
  }

  updateNonPrimary () {
    const stream = this.stream

    if ((stream._duplexState & WRITE_FINISHING_STATUS) === WRITE_FINISHING) {
      stream._duplexState = (stream._duplexState | WRITE_ACTIVE) & WRITE_NOT_FINISHING
      stream._final(afterFinal.bind(this))
      return
    }

    if ((stream._duplexState & DESTROY_STATUS) === DESTROYING) {
      if ((stream._duplexState & ACTIVE) === 0) {
        stream._duplexState |= ACTIVE
        stream._destroy(afterDestroy.bind(this))
      }
      return
    }

    if ((stream._duplexState & OPEN_STATUS) === OPENING) {
      stream._duplexState = (stream._duplexState | ACTIVE) & NOT_OPENING
      stream._open(afterOpen.bind(this))
    }
  }

  updateNextTick () {
    if ((this.stream._duplexState & WRITE_NEXT_TICK) !== 0) return
    this.stream._duplexState |= WRITE_NEXT_TICK
    process.nextTick(updateWriteNT, this)
  }
}

class ReadableState {
  constructor (stream, { highWaterMark = 16384, map = null, mapReadable, byteLength, byteLengthReadable } = {}) {
    this.stream = stream
    this.queue = new FIFO()
    this.highWaterMark = highWaterMark
    this.buffered = 0
    this.error = null
    this.pipeline = null
    this.byteLength = byteLengthReadable || byteLength || defaultByteLength
    this.map = mapReadable || map
    this.pipeTo = null
    this.afterRead = afterRead.bind(this)
  }

  pipe (pipeTo, cb) {
    this.stream._duplexState |= READ_PIPE_DRAINED
    this.pipeTo = pipeTo
    this.pipeline = new Pipeline(this.stream, pipeTo, cb || null)

    if (cb) this.stream.on('error', noop) // We already error handle this so supress crashes

    if (isStreamx(pipeTo)) {
      pipeTo._writableState.pipeline = this.pipeline
      if (cb) pipeTo.on('error', noop) // We already error handle this so supress crashes
      pipeTo.on('finish', this.pipeline.finished.bind(this.pipeline)) // TODO: just call finished from pipeTo itself
    } else {
      const onerror = this.pipeline.done.bind(this.pipeline, pipeTo)
      const onclose = this.pipeline.done.bind(this.pipeline, pipeTo, null) // onclose has a weird bool arg
      pipeTo.on('error', onerror)
      pipeTo.on('close', onclose)
      pipeTo.on('finish', this.pipeline.finished.bind(this.pipeline))
    }

    pipeTo.on('drain', afterDrain.bind(this))
  }

  push (data) {
    const stream = this.stream

    if (data === null) {
      this.highWaterMark = 0
      stream._duplexState = (stream._duplexState | READ_ENDING) & READ_NON_PRIMARY_AND_PUSHED
      return false
    }

    if (this.map !== null) data = this.map(data)
    this.buffered += this.byteLength(data)
    this.queue.push(data)

    stream._duplexState = (stream._duplexState | READ_QUEUED) & READ_PUSHED

    return this.buffered < this.highWaterMark
  }

  shift () {
    const data = this.queue.shift()

    this.buffered -= this.byteLength(data)
    if (this.buffered === 0) this.stream._duplexState &= READ_NOT_QUEUED
    return data
  }

  unshift (data) {
    let tail
    const pending = []

    while ((tail === this.queue.shift()) !== undefined) {
      pending.push(tail)
    }

    this.push(data)

    for (let i = 0; i < pending.length; i++) {
      this.queue.push(pending[i])
    }
  }

  read () {
    const stream = this.stream

    if ((stream._duplexState & READ_STATUS) === READ_QUEUED) {
      const data = this.shift()
      if ((stream._duplexState & READ_EMIT_DATA) !== 0) stream.emit('data', data)
      if (this.pipeTo !== null && this.pipeTo.write(data) === false) stream._duplexState &= READ_PIPE_NOT_DRAINED
      return data
    }

    return null
  }

  drain () {
    const stream = this.stream

    while ((stream._duplexState & READ_STATUS) === READ_QUEUED && (stream._duplexState & READ_FLOWING) !== 0) {
      const data = this.shift()
      if ((stream._duplexState & READ_EMIT_DATA) !== 0) stream.emit('data', data)
      if (this.pipeTo !== null && this.pipeTo.write(data) === false) stream._duplexState &= READ_PIPE_NOT_DRAINED
    }
  }

  update () {
    const stream = this.stream

    this.drain()

    while (this.buffered < this.highWaterMark && (stream._duplexState & SHOULD_NOT_READ) === 0) {
      stream._duplexState |= READ_ACTIVE_AND_SYNC_AND_NEEDS_PUSH
      stream._read(this.afterRead)
      stream._duplexState &= READ_NOT_SYNC
      if ((stream._duplexState & READ_ACTIVE) === 0) this.drain()
    }

    if ((stream._duplexState & READ_READABLE_STATUS) === READ_EMIT_READABLE_AND_QUEUED) {
      stream._duplexState |= READ_EMITTED_READABLE
      stream.emit('readable')
    }

    if ((stream._duplexState & READ_PRIMARY_AND_ACTIVE) === 0) this.updateNonPrimary()
  }

  updateNonPrimary () {
    const stream = this.stream

    if ((stream._duplexState & READ_ENDING_STATUS) === READ_ENDING) {
      stream._duplexState = (stream._duplexState | READ_DONE) & READ_NOT_ENDING
      stream.emit('end')
      if ((stream._duplexState & AUTO_DESTROY) === DONE) stream._duplexState |= DESTROYING
      if (this.pipeTo !== null) this.pipeTo.end()
    }

    if ((stream._duplexState & DESTROY_STATUS) === DESTROYING) {
      if ((stream._duplexState & ACTIVE) === 0) {
        stream._duplexState |= ACTIVE
        stream._destroy(afterDestroy.bind(this))
      }
      return
    }

    if ((stream._duplexState & OPEN_STATUS) === OPENING) {
      stream._duplexState = (stream._duplexState | ACTIVE) & NOT_OPENING
      stream._open(afterOpen.bind(this))
    }
  }

  updateNextTick () {
    if ((this.stream._duplexState & READ_NEXT_TICK) !== 0) return
    this.stream._duplexState |= READ_NEXT_TICK
    process.nextTick(updateReadNT, this)
  }
}

class TransformState {
  constructor (stream) {
    this.data = null
    this.afterTransform = afterTransform.bind(stream)
    this.afterFinal = null
  }
}

class Pipeline {
  constructor (src, dst, cb) {
    this.from = src
    this.to = dst
    this.afterPipe = cb
    this.error = null
    this.pipeToFinished = false
  }

  finished () {
    this.pipeToFinished = true
  }

  done (stream, err) {
    if (err) this.error = err

    if (stream === this.to) {
      this.to = null

      if (this.from !== null) {
        if ((this.from._duplexState & READ_DONE) === 0 || !this.pipeToFinished) {
          this.from.destroy(new Error('Writable stream closed prematurely'))
        }
        return
      }
    }

    if (stream === this.from) {
      this.from = null

      if (this.to !== null) {
        if ((stream._duplexState & READ_DONE) === 0) {
          this.to.destroy(new Error('Readable stream closed before ending'))
        }
        return
      }
    }

    if (this.afterPipe !== null) this.afterPipe(this.error)
    this.to = this.from = this.afterPipe = null
  }
}

function afterDrain () {
  this.stream._duplexState |= READ_PIPE_DRAINED
  if ((this.stream._duplexState & READ_ACTIVE_AND_SYNC) === 0) this.updateNextTick()
}

function afterFinal (err) {
  const stream = this.stream
  if (err) stream.destroy(err)
  if ((stream._duplexState & DESTROY_STATUS) === 0) {
    stream._duplexState |= WRITE_DONE
    stream.emit('finish')
  }
  if ((stream._duplexState & AUTO_DESTROY) === DONE) {
    stream._duplexState |= DESTROYING
  }

  stream._duplexState &= WRITE_NOT_ACTIVE
  this.update()
}

function afterDestroy (err) {
  const stream = this.stream

  if (!err && this.error !== STREAM_DESTROYED) err = this.error
  if (err) stream.emit('error', err)
  stream._duplexState |= DESTROYED
  stream.emit('close')

  const rs = stream._readableState
  const ws = stream._writableState

  if (rs !== null && rs.pipeline !== null) rs.pipeline.done(stream, err)
  if (ws !== null && ws.pipeline !== null) ws.pipeline.done(stream, err)
}

function afterWrite (err) {
  if (err) this.stream.destroy(err)
  this.stream._duplexState &= WRITE_NOT_ACTIVE
  if ((this.stream._duplexState & WRITE_SYNC) === 0) this.update()
}

function afterRead (err) {
  if (err) this.stream.destroy(err)
  this.stream._duplexState &= READ_NOT_ACTIVE
  if ((this.stream._duplexState & READ_SYNC) === 0) this.update()
}

function updateReadNT (rs) {
  rs.stream._duplexState &= READ_NOT_NEXT_TICK
  rs.update()
}

function updateWriteNT (ws) {
  ws.stream._duplexState &= WRITE_NOT_NEXT_TICK
  ws.update()
}

function afterOpen (err) {
  const stream = this.stream

  if (err) stream.destroy(err)

  if ((stream._duplexState & DESTROYING) === 0) {
    if ((stream._duplexState & READ_PRIMARY_STATUS) === 0) stream._duplexState |= READ_PRIMARY
    if ((stream._duplexState & WRITE_PRIMARY_STATUS) === 0) stream._duplexState |= WRITE_PRIMARY
    stream.emit('open')
  }

  stream._duplexState &= NOT_ACTIVE

  if (stream._writableState !== null) {
    stream._writableState.update()
  }

  if (stream._readableState !== null) {
    stream._readableState.update()
  }
}

function afterTransform (err, data) {
  if (data !== undefined && data !== null) this.push(data)
  this._writableState.afterWrite(err)
}

class Stream extends EventEmitter {
  constructor (opts) {
    super()

    this._duplexState = 0
    this._readableState = null
    this._writableState = null

    if (opts) {
      if (opts.open) this._open = opts.open
      if (opts.destroy) this._destroy = opts.destroy
    }
  }

  _open (cb) {
    cb(null)
  }

  _destroy (cb) {
    cb(null)
  }

  get destroyed () {
    return (this._duplexState & DESTROYED) !== 0
  }

  get destroying () {
    return (this._duplexState & DESTROY_STATUS) !== 0
  }

  destroy (err) {
    if ((this._duplexState & DESTROY_STATUS) === 0) {
      if (!err) err = STREAM_DESTROYED
      this._duplexState = (this._duplexState | DESTROYING) & NON_PRIMARY
      if (this._readableState !== null) {
        this._readableState.error = err
        this._readableState.updateNextTick()
      }
      if (this._writableState !== null) {
        this._writableState.error = err
        this._writableState.updateNextTick()
      }
    }
  }

  on (name, fn) {
    if (this._readableState !== null) {
      if (name === 'data') {
        this._duplexState |= (READ_EMIT_DATA | READ_RESUMED)
        this._readableState.updateNextTick()
      }
      if (name === 'readable') {
        this._duplexState |= READ_EMIT_READABLE
        this._readableState.updateNextTick()
      }
    }

    if (this._writableState !== null) {
      if (name === 'drain') {
        this._duplexState |= WRITE_EMIT_DRAIN
        this._writableState.updateNextTick()
      }
    }

    return super.on(name, fn)
  }
}

class Readable extends Stream {
  constructor (opts) {
    super(opts)

    this._duplexState |= OPENING | WRITE_DONE
    this._readableState = new ReadableState(this, opts)

    if (opts) {
      if (opts.read) this._read = opts.read
    }
  }

  _read (cb) {
    cb(null)
  }

  pipe (dest, cb) {
    this._readableState.pipe(dest, cb)
    this._readableState.updateNextTick()
    return dest
  }

  read () {
    this._readableState.updateNextTick()
    return this._readableState.read()
  }

  push (data) {
    this._readableState.updateNextTick()
    return this._readableState.push(data)
  }

  unshift (data) {
    this._readableState.updateNextTick()
    return this._readableState.unshift(data)
  }

  resume () {
    this._duplexState |= READ_RESUMED
    this._readableState.updateNextTick()
  }

  pause () {
    this._duplexState &= READ_PAUSED
  }

  [asyncIterator] () {
    const stream = this

    let error = null
    let ended = false
    let promiseResolve
    let promiseReject

    this.on('error', (err) => { error = err })
    this.on('end', () => { ended = true })
    this.on('close', () => call(error, null))
    this.on('readable', () => call(null, stream.read()))

    return {
      next () {
        return new Promise(function (resolve, reject) {
          promiseResolve = resolve
          promiseReject = reject
          const data = stream.read()
          if (data !== null) call(null, data)
        })
      }
    }

    function call (err, data) {
      if (promiseReject === null) return
      if (err) promiseReject(err)
      else if (data === null && !ended) promiseReject(STREAM_DESTROYED)
      else promiseResolve({ value: data, done: data === null })
      promiseReject = promiseResolve = null
    }
  }
}

class Writable extends Stream {
  constructor (opts) {
    super(opts)

    this._duplexState |= OPENING | READ_DONE
    this._writableState = new WritableState(this, opts)

    if (opts) {
      if (opts.write) this._write = opts.write
      if (opts.final) this._final = opts.final
    }
  }

  _write (data, cb) {
    cb(null)
  }

  _final (cb) {
    cb(null)
  }

  write (data) {
    this._writableState.updateNextTick()
    return this._writableState.push(data)
  }

  end (data) {
    this._writableState.updateNextTick()
    this._writableState.end(data)
  }
}

class Duplex extends Readable { // and Writable
  constructor (opts) {
    super(opts)

    this._duplexState = OPENING
    this._writableState = new WritableState(this, opts)

    if (opts) {
      if (opts.write) this._write = opts.write
      if (opts.final) this._final = opts.final
    }
  }

  _write (data, cb) {
    cb(null)
  }

  _final (cb) {
    cb(null)
  }

  write (data) {
    this._writableState.updateNextTick()
    return this._writableState.push(data)
  }

  end (data) {
    this._writableState.updateNextTick()
    this._writableState.end(data)
  }
}

class Transform extends Duplex {
  constructor (opts) {
    super(opts)
    this._transformState = new TransformState(this)

    if (opts) {
      if (opts.transform) this._transform = opts.transform
      if (opts.flush) this._flush = opts.flush
    }
  }

  _write (data, cb) {
    if (this._readableState.buffered >= this._readableState.highWaterMark) {
      this._transformState.data = data
    } else {
      this._transform(data, this._transformState.afterTransform)
    }
  }

  _read (cb) {
    if (this._transformState.data !== null) {
      const data = this._transformState.data
      this._transformState.data = null
      cb(null)
      this._transform(data, this._transformState.afterTransform)
    } else {
      cb(null)
    }
  }

  _transform (data, cb) {
    cb(null, data)
  }

  _flush (cb) {
    cb(null)
  }

  _final (cb) {
    this._transformState.afterFinal = cb
    this._flush(transformAfterFlush.bind(this))
  }
}

function transformAfterFlush (err, data) {
  const cb = this._transformState.afterFinal
  if (err) return cb(err)
  if (data !== null && data !== undefined) this.push(data)
  this.push(null)
  cb(null)
}

function isStream (stream) {
  return !!stream._readableState || !!stream._writableState
}

function isStreamx (stream) {
  return typeof stream._duplexState === 'number' && isStream(stream)
}

function defaultByteLength (data) {
  return Buffer.isBuffer(data) ? data.length : 1024
}

function noop () {}

module.exports = {
  isStream,
  isStreamx,
  Stream,
  Writable,
  Readable,
  Duplex,
  Transform
}
