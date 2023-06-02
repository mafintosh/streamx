const test = require('brittle')
const tick = require('queue-tick')
const { Writable, Duplex } = require('../')

test('opens before writes', function (t) {
  t.plan(2)

  const trace = []
  const stream = new Writable({
    open (cb) {
      trace.push('open')
      return cb(null)
    },
    write (data, cb) {
      trace.push('write')
      return cb(null)
    }
  })
  stream.on('close', () => {
    t.is(trace.length, 2)
    t.is(trace[0], 'open')
  })
  stream.write('data')
  stream.end()
})

test('drain', function (t) {
  t.plan(2)

  const stream = new Writable({
    highWaterMark: 1,
    write (data, cb) {
      cb(null)
    }
  })

  t.absent(stream.write('a'))
  stream.on('drain', function () {
    t.pass('drained')
  })
})

test('drain multi write', function (t) {
  t.plan(4)

  const stream = new Writable({
    highWaterMark: 1,
    write (data, cb) {
      cb(null)
    }
  })

  t.absent(stream.write('a'))
  t.absent(stream.write('a'))
  t.absent(stream.write('a'))
  stream.on('drain', function () {
    t.pass('drained')
  })
})

test('drain async write', function (t) {
  t.plan(3)

  let flushed = false

  const stream = new Writable({
    highWaterMark: 1,
    write (data, cb) {
      setImmediate(function () {
        flushed = true
        cb(null)
      })
    }
  })

  t.absent(stream.write('a'))
  t.absent(flushed)
  stream.on('drain', function () {
    t.ok(flushed)
  })
})

test('writev', function (t) {
  t.plan(3)

  const expected = [[], ['ho']]

  const s = new Writable({
    writev (batch, cb) {
      t.alike(batch, expected.shift())
      cb(null)
    }
  })

  for (let i = 0; i < 100; i++) {
    expected[0].push('hi-' + i)
    s.write('hi-' + i)
  }

  s.on('drain', function () {
    s.write('ho')
    s.end()
  })

  s.on('finish', function () {
    t.pass('finished')
  })
})

test('map written data', function (t) {
  t.plan(2)

  const r = new Writable({
    write (data, cb) {
      t.is(data, '{"foo":1}')
      cb()
    },
    map: input => JSON.stringify(input)
  })
  r.on('finish', () => {
    t.pass('finished')
  })
  r.write({ foo: 1 })
  r.end()
})

test('use mapWritable to map data', function (t) {
  t.plan(2)

  const r = new Writable({
    write (data, cb) {
      t.is(data, '{"foo":1}')
      cb()
    },
    map: () => t.fail('.mapWritable has priority'),
    mapWritable: input => JSON.stringify(input)
  })
  r.on('finish', () => {
    t.pass('finished')
  })
  r.write({ foo: 1 })
  r.end()
})

test('many ends', function (t) {
  t.plan(2)

  let finals = 0
  let finish = 0

  const s = new Duplex({
    final (cb) {
      finals++
      cb(null)
    }
  })

  s.end()
  tick(() => {
    s.end()
    tick(() => {
      s.end()
    })
  })

  s.on('finish', function () {
    finish++
    t.is(finals, 1)
    t.is(finish, 1)
  })
})

test('drained helper', async function (t) {
  const w = new Writable({
    write (data, cb) {
      setImmediate(cb)
    }
  })

  for (let i = 0; i < 20; i++) w.write('hi')

  await Writable.drained(w)

  t.is(w._writableState.queue.length, 0)

  for (let i = 0; i < 20; i++) w.write('hi')

  const d1 = Writable.drained(w)

  for (let i = 0; i < 20; i++) w.write('hi')

  const d2 = Writable.drained(w)

  d1.then(() => {
    t.not(w._writableState.queue.length, 0, 'future writes are queued')
  })

  d2.then(() => {
    t.is(w._writableState.queue.length, 0, 'all drained now')
  })

  await d1
  await d2

  await Writable.drained(w)

  t.pass('works if no writes are pending')

  for (let i = 0; i < 20; i++) w.write('hi')

  const d3 = Writable.drained(w)
  w.destroy()

  t.absent(await d3)
  t.absent(await Writable.drained(w), 'already destroyed')
})

test('drained helper, inflight write', async function (t) {
  let writing = false
  const w = new Writable({
    write (data, cb) {
      writing = true
      setImmediate(() => {
        setImmediate(() => {
          writing = false
          cb()
        })
      })
    }
  })

  w.write('hello')
  w.end()

  await new Promise(resolve => setImmediate(resolve))
  t.ok(writing, 'is writing')
  await Writable.drained(w)
  t.absent(writing, 'not writing')
})
