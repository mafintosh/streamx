const tape = require('tape')
const { Duplex, getStreamError } = require('../')

tape('if open does not end, it should stall', function (t) {
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

tape('Using both mapReadable and mapWritable to map data', function (t) {
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
    t.equals(data, '{"num":32}')
  })
  d.on('close', () => {
    t.end()
  })
  d.write('32')
  d.end()
})

tape('get error from stream', function (t) {
  const d = new Duplex()
  d.on('error', () => {})

  const err = new Error('stop')
  d.destroy(err)
  t.same(getStreamError(d), err)

  t.end()
})
