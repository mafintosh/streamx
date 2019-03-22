const tape = require('tape')
const { Readable } = require('../')

tape('ondata', function (t) {
  const r = new Readable()
  const buffered = []
  let ended = 0

  r.push('hello')
  r.push('world')
  r.push(null)

  r.on('data', data => buffered.push(data))
  r.on('end', () => ended++)
  r.on('close', function () {
    t.pass('closed')
    t.same(buffered, [ 'hello', 'world' ])
    t.same(ended, 1)
    t.ok(r.destroyed)
    t.end()
  })
})

tape('resume', function (t) {
  const r = new Readable()
  let ended = 0

  r.push('hello')
  r.push('world')
  r.push(null)

  r.resume()
  r.on('end', () => ended++)
  r.on('close', function () {
    t.pass('closed')
    t.same(ended, 1)
    t.ok(r.destroyed)
    t.end()
  })
})

tape('shorthands', function (t) {
  t.plan(6 + 1)

  const r = new Readable({
    read (cb) {
      this.push('hello')
      cb(null)
    },
    destroy (cb) {
      t.pass('destroyed')
      cb(null)
    }
  })

  r.read(function (err, data) {
    t.same(err, null)
    t.same(data, 'hello')
    r.read(function (err, data) {
      t.same(err, null)
      t.same(data, 'hello')
      r.destroy()
      r.read(function (err, data) {
        t.same(err, new Error('Stream was destroyed'))
        t.same(data, null)
      })
    })
  })
})
