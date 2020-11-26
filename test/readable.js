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
    t.same(buffered, ['hello', 'world'])
    t.same(ended, 1)
    t.ok(r.destroyed)
    t.end()
  })
})

function nextImmediate () {
  return new Promise(resolve => setImmediate(resolve))
}

tape('pause', async function (t) {
  const r = new Readable()
  const buffered = []
  t.equals(Readable.isPaused(r), true, 'starting off paused')
  r.on('data', data => buffered.push(data))
  r.on('close', () => t.end())
  r.push('hello')
  await nextImmediate()
  t.equals(r.pause(), r, '.pause() returns self')
  t.equals(Readable.isPaused(r), true, '.pause() marks stream as paused')
  r.push('world')
  await nextImmediate()
  t.same(buffered, ['hello'], '.pause() prevents data to be read')
  t.equals(r.resume(), r, '.resume() returns self')
  t.equals(Readable.isPaused(r), false, '.resume() marks stream as resumed')
  await nextImmediate()
  t.same(buffered, ['hello', 'world'])
  r.push(null)
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

tape('from array', function (t) {
  const inc = []
  const r = Readable.from([1, 2, 3])
  r.on('data', data => inc.push(data))
  r.on('end', function () {
    t.same(inc, [1, 2, 3])
    t.end()
  })
})

tape('from buffer', function (t) {
  const inc = []
  const r = Readable.from(Buffer.from('hello'))
  r.on('data', data => inc.push(data))
  r.on('end', function () {
    t.same(inc, [Buffer.from('hello')])
    t.end()
  })
})

tape('from async iterator', function (t) {
  async function * test () {
    yield 1
    yield 2
    yield 3
  }

  const inc = []
  const r = Readable.from(test())
  r.on('data', data => inc.push(data))
  r.on('end', function () {
    t.same(inc, [1, 2, 3])
    t.end()
  })
})

tape('from array with highWaterMark', function (t) {
  const r = Readable.from([1, 2, 3], { highWaterMark: 1 })
  t.same(r._readableState.highWaterMark, 1)
  t.end()
})

tape('from async iterator with highWaterMark', function (t) {
  async function * test () {
    yield 1
  }

  const r = Readable.from(test(), { highWaterMark: 1 })
  t.same(r._readableState.highWaterMark, 1)
  t.end()
})

tape('unshift', async function (t) {
  const r = new Readable()
  r.push(1)
  r.push(2)
  r.unshift(0)
  r.push(null)
  const inc = []
  for await (const entry of r) {
    inc.push(entry)
  }
  t.same(inc, [0, 1, 2])
  t.end()
})

tape('from readable should return the original readable', function (t) {
  const r = new Readable()
  t.equal(Readable.from(r), r)
  t.end()
})
