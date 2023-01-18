const test = require('brittle')
const { Duplex, getStreamError } = require('../')

test('if open does not end, it should stall', function (t) {
  t.plan(1)

  const d = new Duplex({
    open () {
      t.pass('open called')
    },
    read () {
      t.fail('should not call read')
    },
    write () {
      t.fail('should not call write')
    }
  })

  d.resume()
  d.write('hi')
})

test('Using both mapReadable and mapWritable to map data', function (t) {
  t.plan(2)

  const d = new Duplex({
    write (data, cb) {
      d.push(data)
      cb()
    },
    final (cb) {
      d.push(null)
      cb()
    },
    mapReadable: num => JSON.stringify({ num }),
    mapWritable: input => parseInt(input, 10)
  })
  d.on('data', data => {
    t.is(data, '{"num":32}')
  })
  d.on('close', () => {
    t.pass('closed')
  })
  d.write('32')
  d.end()
})

test('get error from stream', function (t) {
  const d = new Duplex()
  d.on('error', () => {})

  const err = new Error('stop')
  d.destroy(err)
  t.is(getStreamError(d), err)

  t.end()
})

test('write callback', function (t) {
  t.plan(4)

  const userCallback = function () {
    t.pass('user write callback')
  }

  const stream = new Duplex({
    write (data, cb, callback) {
      t.is(callback, userCallback, 'callback is same instance as write callback')
      stream.push(data)
      callback()
      cb(null)
    },
    final (cb) {
      stream.push(null)
      cb()
    }
  })

  stream.write('a', userCallback)
  stream.end()

  // For some reason this seems required
  stream.on('data', function () {
    t.pass('consume data')
  })

  stream.on('close', function () {
    t.pass('stream closed')
  })
})
