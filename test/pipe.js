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
