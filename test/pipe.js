const tape = require('tape')
const { Readable, Writable } = require('../')

tape('simple pipe', function (t) {
  const buffered = []

  const r = new Readable()
  const w = new Writable({
    write (data, cb) {
      buffered.push(data)
      cb(null)
    },

    final () {
      t.pass('final called')
      t.same(buffered, [ 'hello', 'world' ])
      t.end()
    }
  })

  r.pipe(w)

  r.push('hello')
  r.push('world')
  r.push(null)
})

tape('pipe with callback', function (t) {
  const buffered = []

  const r = new Readable()
  const w = new Writable({
    write (data, cb) {
      buffered.push(data)
      cb(null)
    }
  })

  r.pipe(w, function (err) {
    t.pass('callback called')
    t.same(err, null)
    t.same(buffered, [ 'hello', 'world' ])
    t.end()
  })

  r.push('hello')
  r.push('world')
  r.push(null)
})
