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
})

tape('async write option', async function (t) {
  const r = new Writable({
    write (data) {
      t.equals(data, 'a')
      return new Promise(resolve => setTimeout(resolve, 30))
    }
  })
  const start = Date.now()
  r.on('close', () => {
    t.ok((Date.now() - start) > 25)
    t.end()
  })
  r.end('a')
})

tape('async writev option', async function (t) {
  const r = new Writable({
    highWaterMark: 2,
    byteLength () {
      return 1
    },
    writev (data) {
      t.same(data, ['a', 'b', 'c'])
      return new Promise(resolve => setTimeout(resolve, 30))
    }
  })
  const start = Date.now()
  r.on('close', () => {
    t.ok((Date.now() - start) > 25)
    t.end()
  })
  r.write('a')
  r.write('b')
  r.write('c')
  r.end()
})

tape('async final option', async function (t) {
  const r = new Writable({
    final () {
      return new Promise(resolve => setTimeout(resolve, 30))
    }
  })
  const start = Date.now()
  r.on('close', () => {
    t.ok((Date.now() - start) > 25)
    t.end()
  })
  r.end()
})

tape('error when no promise is returned by async .open template', function (t) {
  t.plan(1)
  const r = new Writable({
    open () {}
  })
  r.on('error', error => {
    t.ok(error instanceof Error)
    t.end()
  })
  r.end()
})

tape('error when no promise is returned by async .final template', function (t) {
  t.plan(1)
  const r = new Writable({
    final () {}
  })
  r.on('error', error => {
    t.ok(error instanceof Error)
    t.end()
  })
  r.write()
  r.end()
})

tape('error when no promise is returned by async .write template', function (t) {
  t.plan(2)
  const r = new Writable({
    write (data) {
      t.equals(data, 'hi')
    }
  })
  r.on('error', error => {
    t.ok(error instanceof Error)
    t.end()
  })
  r.write('hi')
  r.end()
})

tape('error when no promise is returned by async .writev template', function (t) {
  t.plan(2)
  const r = new Writable({
    writev (data) {
      t.deepEquals(data, ['hi'])
    }
  })
  r.on('error', error => {
    t.ok(error instanceof Error)
    t.end()
  })
  r.write('hi')
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
