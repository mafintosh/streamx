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
  t.plan(3 + 1)

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

  r.once('readable', function () {
    t.same(r.read(), 'hello')
    t.same(r.read(), 'hello')
    r.destroy()
    t.same(r.read(), null)
  })
})

tape('both push and the cb needs to be called for re-reads', function (t) {
  t.plan(2)

  let once = true

  const r = new Readable({
    read (cb) {
      t.ok(once, 'read called once')
      once = false
      cb(null)
    }
  })

  r.resume()

  setTimeout(function () {
    once = true
    r.push('hi')
  }, 100)
})
