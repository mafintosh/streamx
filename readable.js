const FIFO = require('fast-fifo')
const assert = require('assert')
const { EventEmitter } = require('events')

const READABLE             = 0b100000000
const NOT_READABLE         = 0b011111111
const READING              = 0b010000000
const NOT_READING          = 0b101111111
const TERMINATED           = 0b001000000
const HAS_READER           = 0b000100000
const HAS_NO_READER        = 0b111011111
const SYNC                 = 0b000010000
const NOT_SYNC             = 0b111101111
const PIPE_DRAINED         = 0b000001000
const PIPE_NOT_DRAINED     = 0b111110111
const READ_NEXT_TICK       = 0b000000100
const NO_READ_NEXT_TICK    = 0b111111011
const RESUMED              = 0b000000010
const PAUSED               = 0b111111101
const EMITTING_DATA        = 0b000000001

const FLOWING = HAS_READER | PIPE_DRAINED | RESUMED
const READABLE_AND_TERMINATED = READABLE | TERMINATED
const SHOULD_NOT_READ = READING | TERMINATED
const READING_AND_SYNC = READING | SYNC

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
  }

  addReader (cb) {
    if (!this.readers) {
      this.readers = []
      this.status |= HAS_READER
    }
    this.readers.push(cb)
  }

  addPipe (pipeTo) {
    assert(this.pipeTo === null, 'Can only pipe to one stream at the time')
    this.pipeTo = pipeTo
    this.status |= PIPE_DRAINED
    this.onpipedrain = onpipedrain.bind(this)
    this.pipeTo.on('drain', this.onpipedrain)
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

  update () {
    while ((this.status & READABLE) !== 0 && (this.status & FLOWING) !== 0) {
      const data = this.shift()

      if (this.readers !== null) {
        const readers = this.readers
        this.status &= HAS_NO_READER
        this.readers = null
        for (let i = 0; i < readers.length; i++) readers[i](null, data)
      }

      if (this.pipeTo !== null) {
        if (data !== null) {
          if (this.pipeTo.write(data) === false) this.status &= PIPE_NOT_DRAINED
        } else {
          this.status &= NOT_READABLE
          this.pipeTo.end()
        }
      }

      if (data === null) {
        this.stream.emit('end')
        this.destroy(null)
        return
      }

      if ((this.status & EMITTING_DATA) !== 0) this.stream.emit('data', data)
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
    console.log('destroy...')
  }
}

function onpipedrain () {
  this.status |= PIPE_DRAINED
  this.read()
}

function afterRead (err) {
  if (err) throw new Error('destroy not yet impl')
  if (((this.status &= NOT_READING) & SYNC) === 0) this.read()
}


module.exports = class ReadableStream extends EventEmitter {
  constructor (opts) {
    super()
    this.readableState = new ReadableState(this, opts)
    if (opts && opts.read) this._read = opts.read
  }

  pipe (dest, cb) {
    this.readableState.addPipe(dest)
    this.readableState.readNextTick()
    return dest
  }

  read (cb) {
    this.readableState.addReader(cb)
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

  on (name, fn) {
    if (name === 'data') {
      this.readableState.status |= EMITTING_DATA
      this.resume()
    }
    super.on(name, fn)
  }

  _read (cb) {
    // Overwrite me
  }
}

function defaultByteLength (b) {
  return Buffer.isBuffer(b) ? b.length : 1024
}

function readNT (rs) {
  rs.status &= NO_READ_NEXT_TICK
  rs.read()
}
