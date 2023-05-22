const test = require('brittle')
const { PassThrough, Writable, Readable } = require('../')

test('passthrough', t => {
  t.plan(3)

  let i = 0
  const p = new PassThrough()
  const w = new Writable({
    write (data, cb) {
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

tape('async transform option', async function (t) {
  const r = Readable.from([1, 2, 3]).pipe(new PassThrough({
    async transform (a) {
      return a.toString()
    }
  }))

  const result = []
  for await (const entry of r) {
    result.push(entry)
  }
  t.same(result, ['1', '2', '3'])
  t.end()
})

tape('async final option', async function (t) {
  const r = Readable.from([1, 2, 3]).pipe(new PassThrough({
    flush () {
      return new Promise(resolve => setTimeout(resolve, 30))
    }
  }))
  const start = Date.now()
  r.on('close', () => {
    t.ok((Date.now() - start) > 25)
    t.end()
  })
  r.resume()
})
