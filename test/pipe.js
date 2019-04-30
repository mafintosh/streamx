const tape = require('tape')
const { Readable, Writable } = require('../')

tape('pipe with callback - error case', function (t) {
  const r = new Readable()
  const w = new Writable({
    write (data, cb) {
      cb(new Error('blerg'))
    }
  })

  r.pipe(w, function (err) {
    t.pass('callback called')
    t.same(err, new Error('blerg'))
    t.end()
  })

  r.push('hello')
  r.push('world')
  r.push(null)
})
