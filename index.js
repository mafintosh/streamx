const { EventEmitter } = require('events')
const { STREAM_DESTROYED } = require('./errors')

const FIFO = require('fast-fifo')

/* eslint-disable no-multi-spaces */

const MAX = ((1 << 24) - 1)

// Shared state
const OPENING     = 0b001
const DESTROYING  = 0b010
const DESTROYED   = 0b100

const NOT_OPENING = MAX ^ OPENING

// Read state
const READ_ACTIVE           = 0b000000000001 << 3
const READ_PRIMARY          = 0b000000000010 << 3
const READ_SYNC             = 0b000000000100 << 3
const READ_QUEUED           = 0b000000001000 << 3
const READ_RESUMED          = 0b000000010000 << 3
const READ_PIPE_DRAINED     = 0b000000100000 << 3
const READ_ENDING           = 0b000001000000 << 3
const READ_EMIT_DATA        = 0b000010000000 << 3
const READ_EMIT_READABLE    = 0b000100000000 << 3
const READ_EMITTED_READABLE = 0b001000000000 << 3
const READ_DONE             = 0b010000000000 << 3
const READ_NEXT_TICK        = 0b100000000001 << 3 // also active

const READ_NOT_ACTIVE       = MAX ^ READ_ACTIVE
const READ_NON_PRIMARY      = MAX ^ READ_PRIMARY
const READ_NOT_SYNC         = MAX ^ READ_SYNC
const READ_PAUSED           = MAX ^ READ_RESUMED
const READ_NOT_QUEUED       = MAX ^ (READ_QUEUED | READ_EMITTED_READABLE)
const READ_NOT_ENDING       = MAX ^ READ_ENDING
const READ_PIPE_NOT_DRAINED = MAX ^ (READ_RESUMED | READ_PIPE_DRAINED)
const READ_NOT_NEXT_TICK    = MAX ^ READ_NEXT_TICK

// Write state
const WRITE_ACTIVE     = 0b000000001 << 15
const WRITE_PRIMARY    = 0b000000010 << 15
const WRITE_SYNC       = 0b000000100 << 15
const WRITE_QUEUED     = 0b000001000 << 15
const WRITE_UNDRAINED  = 0b000010000 << 15
const WRITE_DONE       = 0b000100000 << 15
const WRITE_EMIT_DRAIN = 0b001000000 << 15
const WRITE_NEXT_TICK  = 0b010000001 << 15 // also active
const WRITE_FINISHING  = 0b100000000 << 15

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
const READ_PRIMARY_AND_ACTIVE = READ_PRIMARY | READ_ACTIVE
const READ_ENDING_STATUS = OPEN_STATUS | READ_ENDING | READ_QUEUED
const READ_EMIT_READABLE_AND_QUEUED = READ_EMIT_READABLE | READ_QUEUED
const READ_READABLE_STATUS = OPEN_STATUS | READ_EMIT_READABLE | READ_QUEUED | READ_EMITTED_READABLE
const SHOULD_NOT_READ = OPEN_STATUS | READ_ACTIVE | READ_ENDING | READ_DONE

// Combined write state
const WRITE_PRIMARY_STATUS = OPEN_STATUS | WRITE_FINISHING | WRITE_DONE
const WRITE_QUEUED_AND_UNDRAINED = WRITE_QUEUED | WRITE_UNDRAINED
const WRITE_NEEDS_EMIT_DRAIN = WRITE_UNDRAINED | WRITE_EMIT_DRAIN
const WRITE_STATUS = OPEN_STATUS | WRITE_ACTIVE | WRITE_QUEUED
const WRITE_PRIMARY_AND_ACTIVE = WRITE_PRIMARY | WRITE_ACTIVE
const WRITE_ACTIVE_AND_SYNC = WRITE_ACTIVE | WRITE_SYNC
const WRITE_FINISHING_STATUS = OPEN_STATUS | WRITE_FINISHING | WRITE_QUEUED

class WritableState {
  constructor (stream, { highWaterMark = 16384, map = null, mapWritable, byteLength, byteLengthWritable } = {}) {
    this.stream = stream
    this.queue = new FIFO()
    this.highWaterMark = highWaterMark
    this.buffered = 0
    this.error = null
    this.byteLength = byteLengthWritable || byteLength || defaultByteLength
    this.map = mapWritable || map
    this.afterWrite = afterWrite.bind(this)
  }

  push (data) {
    if (this.map !== null) data = this.map(data)

    this.buffered += this.byteLength(data)
    this.queue.push(data)

    if (this.buffered < this.highWaterMark) {
      this.stream.status |= WRITE_QUEUED
      return true
    }

    this.stream.status |= WRITE_QUEUED_AND_UNDRAINED
    return false
  }

  shift () {
    const data = this.queue.shift()
    const stream = this.stream

    this.buffered -= this.byteLength(data)

    if (this.buffered === 0) {
      if ((stream.status & WRITE_NEEDS_EMIT_DRAIN) !== 0) {
        stream.status &= WRITE_DRAINED
        stream.emit('drain')
      } else {
        stream.status &= WRITE_DRAINED
      }
    }

    return data
  }

  end (data) {
    if (data !== undefined && data !== null) this.push(data)
    this.stream.status = (this.stream.status | WRITE_FINISHING) & WRITE_NON_PRIMARY
  }

  update () {
    const stream = this.stream

    while ((stream.status & WRITE_STATUS) === WRITE_QUEUED) {
      const data = this.shift()
      stream.status |= WRITE_ACTIVE_AND_SYNC
      stream._write(data, this.afterWrite)
      stream.status &= WRITE_NOT_SYNC
    }

    if ((stream.status & WRITE_PRIMARY_AND_ACTIVE) === 0) this.updateNonPrimary()
  }

  updateNonPrimary () {
    const stream = this.stream

    if ((stream.status & WRITE_FINISHING_STATUS) === WRITE_FINISHING) {
      stream.status = (stream.status | WRITE_ACTIVE) & WRITE_NOT_FINISHING
      stream._final(afterFinal.bind(this))
      return
    }

    if ((stream.status & DESTROY_STATUS) === DESTROYING) {
      if ((stream.status & ACTIVE) === 0) {
        stream.status |= ACTIVE
        stream._destroy(afterDestroy.bind(this))
      }
      return
    }

    if ((stream.status & OPEN_STATUS) === OPENING) {
      stream.status = (stream.status | ACTIVE) & NOT_OPENING
      stream._open(afterOpen.bind(this))
    }
  }

  updateNextTick () {
    if ((this.stream.status & WRITE_NEXT_TICK) !== 0) return
    this.stream.status |= WRITE_NEXT_TICK
    process.nextTick(updateWriteNT, this)
  }
}

class PipeState {
  constructor (src, dst, cb) {
    this.pipeFrom = src
    this.pipeTo = dst
    this.afterPipe = cb
    this.error = null
    this.pipeToFinished = false
  }

  finished () {
    this.pipeToFinished = true
  }

  done (stream, err) {
    if (err) this.error = err

    if (stream === this.pipeTo) {
      this.pipeTo = null

      if (this.pipeFrom !== null) {
        if ((this.pipeFrom.status & READ_DONE) === 0 || !this.pipeToFinished) {
          this.pipeFrom.destroy(new Error('Writable stream closed prematurely'))
        }
        return
      }
    }

    if (stream === this.pipeFrom) {
      this.pipeFrom = null

      if (this.pipeTo !== null) {
        if ((stream.status & READ_DONE) === 0) {
          this.pipeTo.destroy(new Error('Readable stream closed before ending'))
        }
        return
      }
    }

    if (this.afterPipe !== null) this.afterPipe(this.error)
    this.pipeTo = this.pipeFrom = this.afterPipe = null
  }
}

class ReadableState {
  constructor (stream, { highWaterMark = 16384, map = null, mapReadable, byteLength, byteLengthReadable } = {}) {
    this.stream = stream
    this.queue = new FIFO()
    this.highWaterMark = highWaterMark
    this.buffered = 0
    this.error = null
    this.byteLength = byteLengthReadable || byteLength || defaultByteLength
    this.map = mapReadable || map
    this.pipe = null
    this.afterRead = afterRead.bind(this)
  }

  pipeTo (pipe, cb) {
    this.stream.status |= READ_PIPE_DRAINED
    this.pipe = pipe
    this.stream.pipeState = new PipeState(this.stream, pipe, cb || null)
    if (pipe.pipeState === null) pipe.pipeState = this.stream.pipeState

    pipe.on('finish', this.stream.pipeState.finished.bind(this.stream.pipeState))
    pipe.on('drain', afterDrain.bind(this))
  }

  push (data) {
    const stream = this.stream

    if ((stream.status & READ_ACTIVE) === 0) this.updateNextTick()

    if (data === null) {
      this.highWaterMark = 0
      stream.status = (stream.status | READ_ENDING) & READ_NON_PRIMARY
      return false
    }

    if (this.map !== null) data = this.map(data)
    this.buffered += this.byteLength(data)
    this.queue.push(data)

    stream.status |= READ_QUEUED

    return this.buffered < this.highWaterMark
  }

  shift () {
    const data = this.queue.shift()

    this.buffered -= this.byteLength(data)
    if (this.buffered === 0) this.stream.status &= READ_NOT_QUEUED
    return data
  }

  read () {
    const stream = this.stream

    if ((stream.status & READ_STATUS) === READ_QUEUED) {
      const data = this.shift()
      if ((stream.status & READ_EMIT_DATA) !== 0) stream.emit('data', data)
      if (this.pipe !== null && this.pipe.write(data) === false) stream.status &= READ_PIPE_NOT_DRAINED
      return data
    }

    return null
  }

  drain () {
    const stream = this.stream

    while ((stream.status & READ_STATUS) === READ_QUEUED && (stream.status & READ_FLOWING) !== 0) {
      const data = this.shift()
      if ((stream.status & READ_EMIT_DATA) !== 0) stream.emit('data', data)
      if (this.pipe !== null && this.pipe.write(data) === false) stream.status &= READ_PIPE_NOT_DRAINED
    }
  }

  update () {
    const stream = this.stream

    this.drain()

    while (this.buffered < this.highWaterMark && (stream.status & SHOULD_NOT_READ) === 0) {
      stream.status |= READ_ACTIVE_AND_SYNC
      stream._read(this.afterRead)
      this.drain()
      stream.status &= READ_NOT_SYNC
    }

    if ((stream.status & READ_READABLE_STATUS) === READ_EMIT_READABLE_AND_QUEUED) {
      stream.status |= READ_EMITTED_READABLE
      stream.emit('readable')
    }

    if ((stream.status & READ_PRIMARY_AND_ACTIVE) === 0) this.updateNonPrimary()
  }

  updateNonPrimary () {
    const stream = this.stream

    if ((stream.status & READ_ENDING_STATUS) === READ_ENDING) {
      stream.status = (stream.status | READ_DONE) & READ_NOT_ENDING
      stream.emit('end')
      if ((stream.status & AUTO_DESTROY) === DONE) stream.status |= DESTROYING
      if (this.pipe !== null) this.pipe.end()
    }

    if ((stream.status & DESTROY_STATUS) === DESTROYING) {
      if ((stream.status & ACTIVE) === 0) {
        stream.status |= ACTIVE
        stream._destroy(afterDestroy.bind(this))
      }
      return
    }

    if ((stream.status & OPEN_STATUS) === OPENING) {
      stream.status = (stream.status | ACTIVE) & NOT_OPENING
      stream._open(afterOpen.bind(this))
    }
  }

  updateNextTick () {
    if ((this.stream.status & READ_NEXT_TICK) !== 0) return
    this.stream.status |= READ_NEXT_TICK
    process.nextTick(updateReadNT, this)
  }
}

function afterDrain () {
  this.stream.status |= READ_PIPE_DRAINED
  if ((this.stream.status & READ_ACTIVE_AND_SYNC) === 0) this.updateNextTick()
}

function afterFinal (err) {
  const stream = this.stream
  if (err) stream.destroy(err)
  if ((stream.status & DESTROY_STATUS) === 0) {
    stream.status |= WRITE_DONE
    stream.emit('finish')
  }
  if ((stream.status & AUTO_DESTROY) === DONE) {
    stream.status |= DESTROYING
  }

  stream.status &= WRITE_NOT_ACTIVE
  this.update()
}

function afterDestroy (err) {
  const stream = this.stream

  if (!err && this.error !== STREAM_DESTROYED) err = this.error
  if (err) stream.emit('error', err)
  stream.status |= DESTROYED
  stream.emit('close')
  if (stream.pipeState !== null) stream.pipeState.done(stream, err)
}

function afterWrite (err) {
  if (err) this.stream.destroy(err)
  this.stream.status &= WRITE_NOT_ACTIVE
  if ((this.stream.status & WRITE_SYNC) === 0) this.update()
}

function afterRead (err) {
  if (err) this.stream.destroy(err)
  this.stream.status &= READ_NOT_ACTIVE
  if ((this.stream.status & READ_SYNC) === 0) this.update()
}

function updateReadNT (rs) {
  rs.stream.status &= READ_NOT_NEXT_TICK
  rs.update()
}

function updateWriteNT (ws) {
  ws.stream.status &= WRITE_NOT_NEXT_TICK
  ws.update()
}

function afterOpen (err) {
  const stream = this.stream

  if (err) stream.destroy(err)

  if ((stream.status & DESTROYING) === 0) {
    if ((stream.status & READ_PRIMARY_STATUS) === 0) stream.status |= READ_PRIMARY
    if ((stream.status & WRITE_PRIMARY_STATUS) === 0) stream.status |= WRITE_PRIMARY
    stream.emit('open')
  }

  stream.status &= NOT_ACTIVE

  if (stream.writableState !== null) {
    stream.writableState.update()
  }

  if (stream.readableState !== null) {
    stream.readableState.update()
  }
}

class Stream extends EventEmitter {
  constructor (opts) {
    super()

    this.status = 0
    this.readableState = null
    this.writableState = null
    this.pipeState = null

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
    return (this.status & DESTROYED) !== 0
  }

  get destroying () {
    return (this.status & DESTROY_STATUS) !== 0
  }

  destroy (err) {
    if ((this.status & DESTROY_STATUS) === 0) {
      if (!err) err = STREAM_DESTROYED
      this.status = (this.status | DESTROYING) & NON_PRIMARY
      if (this.readableState !== null) {
        this.readableState.error = err
        this.readableState.updateNextTick()
      }
      if (this.writableState !== null) {
        this.writableState.error = err
        this.writableState.updateNextTick()
      }
    }
  }

  on (name, fn) {
    if (this.readableState !== null) {
      if (name === 'data') {
        this.status |= (READ_EMIT_DATA | READ_RESUMED)
        this.readableState.updateNextTick()
      }
      if (name === 'readable') {
        this.status |= READ_EMIT_READABLE
        this.readableState.updateNextTick()
      }
    }

    if (this.writableState !== null) {
      if (name === 'drain') {
        this.status |= WRITE_EMIT_DRAIN
        this.writableState.updateNextTick()
      }
    }

    return super.on(name, fn)
  }
}

class Readable extends Stream {
  constructor (opts) {
    super(opts)

    this.status |= OPENING | WRITE_DONE
    this.readableState = new ReadableState(this, opts)

    if (opts) {
      if (opts.read) this._read = opts.read
    }
  }

  _read (cb) {
    cb(null)
  }

  pipe (dest, cb) {
    this.readableState.pipeTo(dest, cb)
    this.readableState.updateNextTick()
    return dest
  }

  read () {
    this.readableState.updateNextTick()
    return this.readableState.read()
  }

  push (data) {
    this.readableState.updateNextTick()
    return this.readableState.push(data)
  }

  resume () {
    this.status |= READ_RESUMED
    this.readableState.updateNextTick()
  }

  pause () {
    this.status &= READ_PAUSED
  }
}

class Writable extends Stream {
  constructor (opts) {
    super()

    this.status |= OPENING | READ_DONE
    this.writableState = new WritableState(this, opts)

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
    this.writableState.updateNextTick()
    return this.writableState.push(data)
  }

  end (data) {
    this.writableState.updateNextTick()
    this.writableState.end(data)
  }
}

class Duplex extends Readable { // and Writable
  constructor (opts) {
    super(opts)

    this.status = OPENING
    this.writableState = new WritableState(this, opts)

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
    this.writableState.updateNextTick()
    return this.writableState.push(data)
  }

  end (data) {
    this.writableState.updateNextTick()
    this.writableState.end(data)
  }
}

class Transform extends Duplex { // WIP
  constructor (opts) {
    super(opts)

    if (opts) {
      if (opts.transform) this._transform = opts.transform
    }
  }

  _write (data, cb) {

  }

  _read (cb) {

  }

  _transform (data, cb) {
    this.push(data)
    cb()
  }
}

function isStream (stream) {
  return !!stream.readableState || !!stream.writableState
}

function emitsClose (stream) {
  return isStableStream(stream)
}

function isStableStream (stream) {
  return typeof stream.status === 'number' && isStream(stream)
}

function defaultByteLength (data) {
  return Buffer.isBuffer(data) ? data.length : 1024
}

module.exports = {
  isStream,
  isStableStream,
  Stream,
  Writable,
  Readable,
  Duplex,
  Transform
}
