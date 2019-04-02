const { EventEmitter } = require('events')
const { STREAM_DESTROYED } = require('./errors')
const FIFO = require('fast-fifo')

/* eslint-disable no-multi-spaces */
const ACTIVE           = 0b00000000001
const NOT_ACTIVE       = 0b11111111110
const QUEUED           = 0b00000000010
const NOT_QUEUED       = 0b10111111101 // also clears drain
const SYNC             = 0b00000000100
const NOT_SYNC         = 0b11111111011
const PRIMARY          = 0b00000001000
const NON_PRIMARY      = 0b11111110111
const NEXT_TICKING     = 0b00000010000
const NOT_NEXT_TICKING = 0b11111101111
const DESTROYING       = 0b00000100000
const FINISHING        = 0b00001000000
const NOT_FINISHING    = 0b11110111111
const FINISHED         = 0b00010000000
const OPENING          = 0b00100000000
const NOT_OPENING      = 0b11011111111
const NEEDS_DRAIN      = 0b01000000000
const EMITTING_DRAIN   = 0b10000000000

const NEXT_TICKING_AND_ACTIVE = NEXT_TICKING | ACTIVE
const FINISH_STATUS = FINISHING | QUEUED
const FINISHED_AND_DESTROYING = FINISHED | DESTROYING
const ACTIVE_AND_SYNC = ACTIVE | SYNC
const QUEUED_AND_NEEDS_DRAIN = QUEUED | NEEDS_DRAIN

const PRIMARY_AND_ACTIVE = PRIMARY | ACTIVE
const WRITE_STATUS = OPENING | DESTROYING | QUEUED | ACTIVE
const NEEDS_EMIT_DRAIN = EMITTING_DRAIN | NEEDS_DRAIN

class WritableState {
  constructor (stream, { highWaterMark = 16384, byteLength, byteLengthWritable, map = null, mapWritable } = {}) {
    this.status = OPENING
    this.queue = new FIFO()
    this.highWaterMark = highWaterMark
    this.buffered = 0
    this.byteLength = byteLengthWritable || byteLength || defaultByteLength
    this.map = mapWritable || map
    this.afterWrite = afterWrite.bind(this)
    this.error = null
    this.stream = stream
  }

  push (data) {
    if (this.map !== null) data = this.map(data)

    this.buffered += this.byteLength(data)
    this.queue.push(data)

    if (this.buffered < this.highWaterMark) {
      this.status |= QUEUED
      return true
    }

    this.status |= QUEUED_AND_NEEDS_DRAIN
    return false
  }

  shift () {
    const data = this.queue.shift()

    this.buffered -= this.byteLength(data)

    if (this.buffered === 0) {
      if ((this.status & NEEDS_EMIT_DRAIN) !== 0) {
        this.status &= NOT_QUEUED
        this.stream.emit('drain')
      } else {
        this.status &= NOT_QUEUED
      }
    }

    return data
  }

  end (data) {
    if (data !== undefined && data !== null) this.push(data)
    this.status = (this.status | FINISHING) & NON_PRIMARY
  }

  destroy (err) {
    if (!this.error) this.error = err || STREAM_DESTROYED
    this.status = (this.status | DESTROYING) & NON_PRIMARY
  }

  update () {
    while ((this.status & WRITE_STATUS) === QUEUED) {
      const data = this.shift()
      this.status |= ACTIVE_AND_SYNC
      this.stream._write(data, this.afterWrite)
      this.status &= NOT_SYNC
    }

    if ((this.status & PRIMARY_AND_ACTIVE) === 0) this.updateNonPrimary()
  }

  updateNextTick () {
    if ((this.status & NEXT_TICKING_AND_ACTIVE) !== 0) return
    this.status |= NEXT_TICKING
    process.nextTick(update, this)
  }

  updateNonPrimary () {
    if ((this.status & DESTROYING) !== 0) {
      this.status |= ACTIVE
      this.stream._destroy(afterDestroy.bind(this))
    } else if ((this.status & OPENING) !== 0) {
      this.status |= ACTIVE
      this.stream._open(afterOpen.bind(this))
    } else if ((this.status & FINISH_STATUS) === FINISHING) {
      this.status |= ACTIVE
      this.stream._final(afterFinal.bind(this))
    }
  }
}

function afterWrite (err) {
  if (err) this.destroy(err)
  this.status &= NOT_ACTIVE
  if ((this.status & SYNC) === 0) this.update()
}

function afterOpen (err) {
  if (err) this.destroy(err)

  this.status &= NOT_OPENING

  if ((this.status & DESTROYING) === 0) {
    if ((this.status & FINISHING) === 0) this.status |= PRIMARY
    this.stream.emit('open')
  }

  this.status &= NOT_ACTIVE
  this.update()
}

function afterFinal (err) {
  if (err) this.destroy(err)

  if ((this.status & DESTROYING) === 0) {
    this.status = (this.status & NOT_FINISHING) | FINISHED_AND_DESTROYING
    this.stream.emit('finish')
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

module.exports = class Writable extends EventEmitter {
  constructor (opts) {
    super()
    this.writableState = new WritableState(this, opts)

    if (opts) {
      if (opts.open) this._open = opts.open
      if (opts.write) this._write = opts.write
      if (opts.final) this._final = opts.final
      if (opts.destroy) this._destroy = opts.destroy
    }
  }

  get destroyed () {
    return (this.writableState.status & DESTROYING) !== 0
  }

  on (name, fn) {
    if (name === 'drain') this.status |= EMITTING_DRAIN
    return super.on(name, fn)
  }

  write (data) {
    this.writableState.updateNextTick()
    return this.writableState.push(data)
  }

  end (data) {
    this.writableState.end(data)
    this.writableState.updateNextTick()
  }

  destroy (err) {
    this.writableState.destroy(err || null)
    this.writableState.updateNextTick()
  }

  _open (cb) {
    // TODO: overwrite me
    cb(null)
  }

  _write (data, cb) {
    // TODO: overwrite me
    cb(null)
  }

  _final (cb) {
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
