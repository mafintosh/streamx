const tape = require('tape')
const { PassThrough, Writable, Readable } = require('../')

tape('passthrough', t => {
  let i = 0
  const p = new PassThrough()
  const w = new Writable({
    write (data, cb) {
      i++
      if (i === 1) t.equal(data, 'foo')
      else if (i === 2) t.equal(data, 'bar')
      else t.fail('too many messages')
      cb()
    }
  })
  w.on('finish', () => t.end())
  const r = new Readable()
  r.pipe(p).pipe(w)
  r.push('foo')
  r.push('bar')
  r.push(null)
})
