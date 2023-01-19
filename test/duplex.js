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

test('duplex: write/end callbacks', function (t) {
  t.plan(8)

  const stream = new Duplex({
    write (data, cb) {
      t.pass('internal _write')
      stream.push(data)
      cb(null)
    },
    final (cb) {
      t.pass('internal _final')
      stream.push(null)
      cb()
    }
  })

  stream.write('a', function (err) {
    t.absent(err, 'write callback')
  })

  stream.end('b', function () {
    t.pass('end callback (finished)')
  })

  stream.on('data', function () {
    t.pass('consume data') // x2
  })

  stream.on('close', function () {
    t.pass('stream closed')
  })
})

test('auto duplex: write/end callback', function (t) {
  t.plan(3)

  const stream = new Duplex()

  stream.on('close', function () {
    t.pass('stream closed')
  })

  stream.write('a', function (err) {
    t.absent(err, 'write callback')
  })

  stream.end('b', function () {
    t.pass('end callback (finished)')
    stream.destroy()
  })
})

test('duplex: end data without callback', function (t) {
  t.plan(8)

  const stream = new Duplex({
    write (data, cb) {
      t.pass('internal _write')
      stream.push(data)
      cb(null)
    },
    final (cb) {
      t.pass('internal _final')
      stream.push(null)
      cb(null)
    }
  })

  stream.write('a', function (err) {
    t.absent(err, 'write callback')
  })

  stream.end('b')

  stream.on('data', function () {
    t.pass('consume data') // x2
  })

  stream.once('finish', function () {
    t.pass('stream finished')
  })

  stream.on('close', function () {
    t.pass('stream closed')
  })
})

test('duplex: end callback', function (t) {
  t.plan(3)

  const stream = new Duplex({
    write (data, cb) {
      t.fail('should not call write')
    },
    final (cb) {
      t.pass('internal _final')
      stream.push(null)
      cb(null)
    }
  })

  stream.end(function () {
    t.pass('end callback (finished)')
  })

  stream.on('close', function () {
    t.pass('stream closed')
  })
})
