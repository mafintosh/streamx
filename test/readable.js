const test = require('brittle')
const { Readable } = require('../')

test('ondata', function (t) {
  t.plan(4)

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
    t.alike(buffered, ['hello', 'world'])
    t.is(ended, 1)
    t.ok(r.destroyed)
  })
})

function nextImmediate () {
  return new Promise(resolve => setImmediate(resolve))
}

test('pause', async function (t) {
  const r = new Readable()
  const buffered = []
  t.is(Readable.isPaused(r), true, 'starting off paused')
  r.on('data', data => buffered.push(data))
  r.on('close', () => t.end())
  r.push('hello')
  await nextImmediate()
  t.is(r.pause(), r, '.pause() returns self')
  t.is(Readable.isPaused(r), true, '.pause() marks stream as paused')
  r.push('world')
  await nextImmediate()
  t.alike(buffered, ['hello'], '.pause() prevents data to be read')
  t.is(r.resume(), r, '.resume() returns self')
  t.is(Readable.isPaused(r), false, '.resume() marks stream as resumed')
  await nextImmediate()
  t.alike(buffered, ['hello', 'world'])
  r.push(null)
})

test('resume', function (t) {
  t.plan(3)

  const r = new Readable()
  let ended = 0

  r.push('hello')
  r.push('world')
  r.push(null)

  r.resume()
  r.on('end', () => ended++)
  r.on('close', function () {
    t.pass('closed')
    t.is(ended, 1)
    t.ok(r.destroyed)
  })
})

test('lazy open', async function (t) {
  let opened = false
  const r = new Readable({
    open (cb) {
      opened = true
      cb(null)
    }
  })
  await nextImmediate()
  t.absent(opened)
  r.push(null)
  await nextImmediate()
  t.ok(opened)
})

test('eager open', async function (t) {
  let opened = false
  const r = new Readable({
    open (cb) {
      opened = true
      cb(null)
    },
    eagerOpen: true
  })
  await nextImmediate()
  t.ok(opened)
  r.push(null)
})

test('shorthands', function (t) {
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
    t.is(r.read(), 'hello')
    t.is(r.read(), 'hello')
    r.destroy()
    t.is(r.read(), null)
  })
})

test('both push and the cb needs to be called for re-reads', function (t) {
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

test('from array', function (t) {
  t.plan(1)

  const inc = []
  const r = Readable.from([1, 2, 3])
  r.on('data', data => inc.push(data))
  r.on('end', function () {
    t.alike(inc, [1, 2, 3])
  })
})

test('from buffer', function (t) {
  t.plan(1)

  const inc = []
  const r = Readable.from(Buffer.from('hello'))
  r.on('data', data => inc.push(data))
  r.on('end', function () {
    t.alike(inc, [Buffer.from('hello')])
  })
})

test('from async iterator', function (t) {
  t.plan(1)

  async function * test () {
    yield 1
    yield 2
    yield 3
  }

  const inc = []
  const r = Readable.from(test())
  r.on('data', data => inc.push(data))
  r.on('end', function () {
    t.alike(inc, [1, 2, 3])
  })
})

test('from array with highWaterMark', function (t) {
  const r = Readable.from([1, 2, 3], { highWaterMark: 1 })
  t.is(r._readableState.highWaterMark, 1)
})

test('from async iterator with highWaterMark', function (t) {
  async function * test () {
    yield 1
  }

  const r = Readable.from(test(), { highWaterMark: 1 })
  t.is(r._readableState.highWaterMark, 1)
})

test('unshift', async function (t) {
  const r = new Readable()
  r.push(1)
  r.push(2)
  r.unshift(0)
  r.push(null)
  const inc = []
  for await (const entry of r) {
    inc.push(entry)
  }
  t.alike(inc, [0, 1, 2])
})

test('from readable should return the original readable', function (t) {
  const r = new Readable()
  t.is(Readable.from(r), r)
})

test('map readable data', async function (t) {
  const r = new Readable({
    map: input => JSON.parse(input)
  })
  r.push('{ "foo": 1 }')
  for await (const obj of r) { // eslint-disable-line
    t.alike(obj, { foo: 1 })
    break
  }
})

test('use mapReadable to map data', async function (t) {
  const r = new Readable({
    map: () => t.fail('.mapReadable has priority'),
    mapReadable: input => JSON.parse(input)
  })
  r.push('{ "foo": 1 }')
  for await (const obj of r) { // eslint-disable-line
    t.alike(obj, { foo: 1 })
    break
  }
})
