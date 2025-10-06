const test = require('brittle')
const { PassThrough, Writable, Readable } = require('../')

test('passthrough', (t) => {
  t.plan(3)

  let i = 0
  const p = new PassThrough()
  const w = new Writable({
    write(data, cb) {
      i++
      if (i === 1) t.is(data, 'foo')
      else if (i === 2) t.is(data, 'bar')
      else t.fail('too many messages')
      cb()
    }
  })
  w.on('finish', () => t.pass('finished'))
  const r = new Readable()
  r.pipe(p).pipe(w)
  r.push('foo')
  r.push('bar')
  r.push(null)
})
