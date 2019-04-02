const { EventEmitter } = require('events')
const { STREAM_DESTROYED } = require('./errors')
const FIFO = require('fast-fifo')
const { couple } = require('./pipeline')
const assert = require('nanoassert')

/* eslint-disable no-multi-spaces */
const ACTIVE            = 0b00000000000001
const NOT_ACTIVE        = 0b11111111111110
const QUEUED            = 0b00000000000010
const NOT_QUEUED        = 0b01111111111101 // also clears emitted readable
const SYNC              = 0b00000000000100
const NOT_SYNC          = 0b11111111111011
const PRIMARY           = 0b00000000001000
const NON_PRIMARY       = 0b11111111110111
const NEXT_TICKING      = 0b00000000010000
const NOT_NEXT_TICKING  = 0b11111111101111
const DESTROYING        = 0b00000000100000
const ENDING            = 0b00000001000000
const NOT_ENDING        = 0b11111110111111
const ENDED             = 0b00000010000000
const OPENING           = 0b00000100000000
const NOT_OPENING       = 0b11111011111111
const RESUMED           = 0b00001000000000
const PAUSED            = 0b11110111111111
const EMITTING_DATA     = 0b00010000000000
const PIPE_DRAINED      = 0b00100000000000
const PIPE_NOT_DRAINED  = 0b11010111111111 // also clears resumed
const EMITTING_READABLE = 0b01000000000000
const EMITTED_READABLE  = 0b10000000000000

const NEXT_TICKING_AND_ACTIVE = NEXT_TICKING | ACTIVE
const ENDING_AND_QUEUED = ENDING | QUEUED
const ENDED_AND_DESTROYING = ENDED | DESTROYING
const ACTIVE_AND_SYNC = ACTIVE | SYNC
const READABLE_STATUS = EMITTING_READABLE | QUEUED | EMITTED_READABLE
const EMIT_READABLE = EMITTING_READABLE | QUEUED
const PRIMARY_AND_ACTIVE = PRIMARY | ACTIVE
const READ_STATUS = OPENING | DESTROYING | QUEUED | ACTIVE
const READ_SYNC_STATUS = OPENING | DESTROYING | QUEUED
const SHOULD_NOT_READ = ACTIVE | OPENING | DESTROYING | ENDING
const FLOWING = RESUMED | PIPE_DRAINED

class ReadableState {
  constructor (stream, { highWaterMark = 16384, byteLength, byteLengthReadable, map = null, mapReadable } = {}) {
    this.status = OPENING
    this.queue = new FIFO()
    this.highWaterMark = highWaterMark
    this.buffered = 0
    this.byteLength = byteLengthReadable || byteLength || defaultByteLength
    this.map = mapReadable || map
    this.afterRead = afterRead.bind(this)
    this.error = null
    this.stream = stream

    this.pipeTo = null
    this.onpipedrain = null
  }

  push (data) {
    if ((this.status & ACTIVE) === 0) this.updateNextTick()

    if (data === null) {
      this.highWaterMark = 0
      this.status = (this.status | ENDING) & NON_PRIMARY
      return false
    }

    if (this.map !== null) data = this.map(data)
    this.buffered += this.byteLength(data)
    this.queue.push(data)
    this.status |= QUEUED

    return this.buffered < this.highWaterMark
  }

  shift () {
    const data = this.queue.shift()

    this.buffered -= this.byteLength(data)
    if (this.buffered === 0) this.status &= NOT_QUEUED
    return data
  }

  destroy (err) {
    if (!this.error) this.error = err || STREAM_DESTROYED
    this.status = (this.stream | DESTROYING) & NON_PRIMARY
  }

  addPipe (pipeTo, cb) {
    assert(this.pipeTo === null, 'Can only pipe to one stream at the time')

    if ((this.status & ENDED_AND_DESTROYING) !== 0) {
      if ((this.status & ENDED) !== 0) pipeTo.end()
      else if (pipeTo.destroy) pipeTo.destroy(this.error)
      process.nextTick(cb, this.error)
      return false
    }

    this.status |= PIPE_DRAINED
    this.onpipedrain = onpipedrain.bind(this)

    this.pipeTo = pipeTo
    this.pipeTo.on('drain', this.onpipedrain)

    // couple the streams ...
    couple(this, pipeTo, cb)

    return true
  }

  read () {
    if ((this.status & READ_SYNC_STATUS) === QUEUED) {
      const data = this.shift()
      if ((this.status & EMITTING_DATA) !== 0) this.stream.emit('data', data)
      return data
    }
    return null
  }

  drain () {
    while ((this.status & READ_STATUS) === QUEUED && (this.status & FLOWING) !== 0) {
      const data = this.shift()
      if ((this.status & EMITTING_DATA) !== 0) this.stream.emit('data', data)
      if (this.pipeTo !== null && this.pipeTo.write(data) === false) this.status &= PIPE_NOT_DRAINED
    }
  }

  end () {
    this.status |= ACTIVE

    if ((this.status & DESTROYING) === 0) {
      this.status = (this.status & NOT_ENDING) | ENDED_AND_DESTROYING
      this.stream.emit('end')
      if (this.pipeTo !== null) this.pipeTo.end()
    }

    this.status &= NOT_ACTIVE
  }

  update () {
    this.drain()

    while (this.buffered < this.highWaterMark && (this.status & SHOULD_NOT_READ) === 0) {
      this.status |= ACTIVE_AND_SYNC
      this.stream._read(this.afterRead)
      this.drain()
      this.status &= NOT_SYNC
    }

    if ((this.status & READABLE_STATUS) === EMIT_READABLE) {
      this.status |= EMITTED_READABLE
      this.stream.emit('readable')
    }

    if ((this.status & PRIMARY_AND_ACTIVE) === 0) this.updateNonPrimary()
  }

  updateNextTick () {
    if ((this.status & NEXT_TICKING_AND_ACTIVE) !== 0) return
    this.status |= NEXT_TICKING
    process.nextTick(update, this)
  }

  updateNonPrimary () {
    if ((this.status & ENDING_AND_QUEUED) === ENDING) this.end()

    if ((this.status & DESTROYING) !== 0) {
      this.status |= ACTIVE
      this.stream._destroy(afterDestroy.bind(this))
    } else if ((this.status & OPENING) !== 0) {
      this.status |= ACTIVE
      this.stream._open(afterOpen.bind(this))
    }
  }
}

function onpipedrain () {
  this.status |= PIPE_DRAINED
  if ((this.status & ACTIVE) === 0) this.updateNextTick()
}

function afterRead (err) {
  if (err) this.destroy(err)
  this.status &= NOT_ACTIVE
  if ((this.status & SYNC) === 0) this.update()
}

function afterOpen (err) {
  if (err) this.destroy(err)

  this.status &= NOT_OPENING

  if ((this.status & DESTROYING) === 0) {
    if ((this.status & ENDING) === 0) this.status |= PRIMARY
    this.stream.emit('open')
  }

  this.status &= NOT_ACTIVE
  this.update()
}

function afterDestroy (err) {
  if (err) this.error = err
  if (this.error !== null && this.error !== STREAM_DESTROYED) this.stream.emit('error', this.error)
  this.stream.emit('close')
}

function update (self) {
  self.status &= NOT_NEXT_TICKING
  self.update()
}

module.exports = class Readable extends EventEmitter {
  constructor (opts) {
    super()
    this.readableState = new ReadableState(this, opts)

    if (opts) {
      if (opts.open) this._open = opts.open
      if (opts.read) this._read = opts.read
      if (opts.flush) this._flush = opts.flush
      if (opts.destroy) this._destroy = opts.destroy
    }
  }

  get destroyed () {
    return (this.readableState.status & DESTROYING) !== 0
  }

  on (name, fn) {
    if (name === 'data') {
      this.readableState.status |= EMITTING_DATA
      this.resume()
    }
    if (name === 'readable') {
      this.readableState.status |= EMITTING_READABLE
      this.readableState.updateNextTick()
    }
    return super.on(name, fn)
  }

  read () {
    this.readableState.updateNextTick()
    return this.readableState.read()
  }

  pipe (dest, cb) {
    if (this.readableState.addPipe(dest, cb || noop)) {
      this.readableState.updateNextTick()
    }
    return dest
  }

  resume () {
    this.readableState.status |= RESUMED
    this.readableState.updateNextTick()
  }

  pause () {
    this.readableState.status |= PAUSED
  }

  push (data) {
    this.readableState.updateNextTick()
    return this.readableState.push(data)
  }

  destroy (err) {
    this.readableState.destroy(err || null)
    this.readableState.updateNextTick()
  }

  _open (cb) {
    // TODO: overwrite me
    cb(null)
  }

  _read (cb) {
    // TODO: overwrite me
    cb(null)
  }

  _flush (cb) {
    // TODO: overwrite me
    cb(null)
  }

  _destroy (cb) {
    // TODO: overwrite me
    cb(null)
  }
}

function defaultByteLength (data) {
  return Buffer.isBuffer(data) ? data.length : 1024
}

function noop () {}
