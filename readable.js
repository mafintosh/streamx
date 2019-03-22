const FIFO = require('fast-fifo')
const assert = require('nanoassert')
const { EventEmitter } = require('events')
const { couple } = require('./pipeline')
const { STREAM_DESTROYED } = require('./errors')

const READABLE             = 0b10000000000
const NOT_READABLE         = 0b01111111111
const READING              = 0b01000000000
const NOT_READING          = 0b10111111111
const TERMINATED           = 0b00100000000
const HAS_READER           = 0b00010000000
const HAS_NO_READER        = 0b11101111111
const SYNC                 = 0b00001000000
const NOT_SYNC             = 0b11110111111
const PIPE_DRAINED         = 0b00000100000
const PIPE_NOT_DRAINED     = 0b11111011111
const READ_NEXT_TICK       = 0b00000010000
const NO_READ_NEXT_TICK    = 0b11111101111
const RESUMED              = 0b00000001000
const PAUSED               = 0b11111110111
const EMITTING_DATA        = 0b00000000100
const NOT_EMITTING_DATA    = 0b11111111011
const DESTROYED            = 0b00000000010
const EMITTED_END          = 0b00000000001

const FLOWING = HAS_READER | PIPE_DRAINED | RESUMED
const READABLE_AND_TERMINATED = READABLE | TERMINATED
const READABLE_AND_DESTROYED = READABLE | DESTROYED
const SHOULD_NOT_READ = READING | TERMINATED | DESTROYED
const READING_AND_SYNC = READING | SYNC
const DESTROYED_AND_ENDED = DESTROYED | EMITTED_END

class ReadableState {
  constructor (stream, { highWaterMark = 16384, byteLength, map } = {}) {
    this.readers = null
    this.pipeTo = null
    this.queue = new FIFO()
    this.buffered = 0
    this.status = 0
    this.highWaterMark = highWaterMark
    this.byteLength = byteLength || defaultByteLength
    this.map = map || null
    this.afterRead = afterRead.bind(this)
    this.onpipedrain = null
    this.stream = stream
    this.error = null
  }

  addReader (cb) {
    if ((this.status & DESTROYED_AND_ENDED) !== 0)  {
      if ((this.status & EMITTED_END) !== 0) process.nextTick(cb, null, null)
      else process.nextTick(cb, this.error)
      return false
    }

    if (!this.readers) {
      this.readers = []
      this.status |= HAS_READER
    }

    this.readers.push(cb)
    return true
  }

  addPipe (pipeTo, cb) {
    assert(this.pipeTo === null, 'Can only pipe to one stream at the time')

    if ((this.status & DESTROYED) !== 0) {
      if (pipeTo.destroy) pipeTo.destroy(this.error)
      process.nextTick(cb, this.error)
      return false
    }

    this.pipeTo = pipeTo
    this.status |= PIPE_DRAINED
    this.onpipedrain = onpipedrain.bind(this)
    this.pipeTo.on('drain', this.onpipedrain)

    // couple the streams ...
    couple(this, pipeTo, cb)

    return true
  }

  push (data) {
    if (data === null) {
      this.highWaterMark = 0
      this.status |= READABLE_AND_TERMINATED
    } else {
      assert((this.status & TERMINATED) === 0, 'Cannot push to a stream after it has been terminated')
      if (this.map) data = this.map(data)
      this.buffered += this.byteLength(data)
      this.queue.push(data)
      this.status |= READABLE
    }

    return this.buffered < this.highWaterMark
  }

  shift () {
    if (this.buffered === 0) return null

    const data = this.queue.shift()

    this.buffered -= this.byteLength(data)
    assert(this.buffered >= 0, 'byteLength function is not deterministic')

    if (this.buffered === 0 && (this.status & TERMINATED) === 0) this.status &= NOT_READABLE
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

  update () {
    while ((this.status & READABLE_AND_DESTROYED) === READABLE && (this.status & FLOWING) !== 0) {
      const data = this.shift()

      if (this.readers !== null) this.drainReaders(data)

      if (this.pipeTo !== null) {
        if (data !== null) {
          if (this.pipeTo.write(data) === false) this.status &= PIPE_NOT_DRAINED
        } else {
          this.status &= NOT_READABLE
          this.pipeTo.end()
        }
      }

      if (data === null && (this.status & DESTROYED) === 0) {
        this.status |= EMITTED_END
        this.stream.emit('end')
        this.destroy(null)
        return
      }

      if ((this.status & EMITTING_DATA) !== 0) this.stream.emit('data', data)
    }
  }

  drainReaders (data) {
    const readers = this.readers

    this.status &= HAS_NO_READER
    this.readers = null

    for (let i = 0; i < readers.length; i++) {
      const reader = readers[i]
      if ((this.status & DESTROYED) !== 0) reader(this.error, null)
      else reader(null, data)
    }
  }

  read () {
    this.update()
    while (this.buffered < this.highWaterMark && (this.status & SHOULD_NOT_READ) === 0) {
      this.status |= READING_AND_SYNC
      this.stream._read(this.afterRead)
      this.update()
      this.status &= NOT_SYNC
    }
  }

  readNextTick () {
    if (this.status & READ_NEXT_TICK) return
    this.status |= READ_NEXT_TICK
    process.nextTick(readNT, this)
  }

  destroy (err) {
    if ((this.status & DESTROYED) !== 0) return
    this.status |= DESTROYED
    this.status &= NOT_EMITTING_DATA

    if (this.pipeTo !== null) {
      this.pipeTo.destroy(err)
      this.pipeTo = null
    }

    this.stream._destroy(ondestroy.bind(this))
    this.error = err || STREAM_DESTROYED // easy way to check if ondestroy is called sync
  }
}

ReadableState.prototype.STABLE_STREAM = true

function ondestroy (err) {
  if (this.error === null) return process.nextTick(ondestroy.bind(this), err)
  if (!err) err = this.error
  if (err !== STREAM_DESTROYED) this.stream.emit('error', err)
  this.stream.emit('close')
  if (this.readers) this.drainReaders(null)
}

function onpipedrain () {
  this.status |= PIPE_DRAINED
  this.read()
}

function afterRead (err) {
  if (err) this.destroy(err)
  else if (((this.status &= NOT_READING) & SYNC) === 0) this.read()
}

module.exports = class ReadableStream extends EventEmitter {
  constructor (opts) {
    super()
    this.readableState = new ReadableState(this, opts)
    if (opts && opts.read) this._read = opts.read
  }

  get destroyed () {
    return (this.readableState.status & DESTROYED) !== 0
  }

  pipe (dest, cb) {
    if (!this.readableState.addPipe(dest, cb)) return dest
    this.readableState.readNextTick()
    return dest
  }

  read (cb) {
    if (!this.readableState.addReader(cb)) return
    this.readableState.readNextTick()
  }

  resume () {
    this.readableState.status |= RESUMED
    this.readableState.readNextTick()
  }

  pause () {
    this.readableState.status &= PAUSED
  }

  push (data) {
    return this.readableState.push(data)
  }

  unshift (data) {
    this.readableState.unshift(data)
  }

  on (name, fn) {
    if (name === 'data' && (this.status & DESTROYED) === 0) {
      this.readableState.status |= EMITTING_DATA
      this.resume()
    }
    super.on(name, fn)
  }

  destroy (err) {
    this.readableState.destroy(err || null)
  }

  _read (cb) {
    // Overwrite me
  }

  _destroy (cb) {
    // Overwrite me
    process.nextTick(cb, null)
  }
}

function defaultByteLength (b) {
  return Buffer.isBuffer(b) ? b.length : 1024
}

function readNT (rs) {
  rs.status &= NO_READ_NEXT_TICK
  rs.read()
}
