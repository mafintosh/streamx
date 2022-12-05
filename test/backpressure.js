const test = require('brittle')
const { Writable, Readable } = require('../')

test('write backpressure', function (t) {
  const ws = new Writable()

  for (let i = 0; i < 15; i++) {
    t.ok(ws.write('a'), 'not backpressured')
    t.absent(Writable.isBackpressured(ws), 'static check')
  }

  t.absent(ws.write('a'), 'backpressured')
  t.ok(Writable.isBackpressured(ws), 'static check')
})

test('write backpressure with drain', function (t) {
  t.plan(15 * 2 + 2 + 1)

  const ws = new Writable()

  for (let i = 0; i < 15; i++) {
    t.ok(ws.write('a'), 'not backpressured')
    t.absent(Writable.isBackpressured(ws), 'static check')
  }

  t.absent(ws.write('a'), 'backpressured')
  t.ok(Writable.isBackpressured(ws), 'static check')

  ws.on('drain', function () {
    t.absent(Writable.isBackpressured(ws))
  })
})

test('write backpressure with destroy', function (t) {
  const ws = new Writable()

  ws.write('a')
  ws.destroy()

  t.ok(Writable.isBackpressured(ws))
})

test('write backpressure with end', function (t) {
  const ws = new Writable()

  ws.write('a')
  ws.end()

  t.ok(Writable.isBackpressured(ws))
})

test('read backpressure', function (t) {
  const rs = new Readable()

  for (let i = 0; i < 15; i++) {
    t.ok(rs.push('a'), 'not backpressured')
    t.absent(Readable.isBackpressured(rs), 'static check')
  }

  t.absent(rs.push('a'), 'backpressured')
  t.ok(Readable.isBackpressured(rs), 'static check')
})

test('read backpressure with later read', function (t) {
  t.plan(15 * 2 + 2 + 1)

  const rs = new Readable()

  for (let i = 0; i < 15; i++) {
    t.ok(rs.push('a'), 'not backpressured')
    t.absent(Readable.isBackpressured(rs), 'static check')
  }

  t.absent(rs.push('a'), 'backpressured')
  t.ok(Readable.isBackpressured(rs), 'static check')

  rs.once('readable', function () {
    rs.read()
    t.absent(Readable.isBackpressured(rs))
  })
})

test('read backpressure with destroy', function (t) {
  const rs = new Readable()

  rs.push('a')
  rs.destroy()

  t.ok(Readable.isBackpressured(rs))
})

test('read backpressure with push(null)', function (t) {
  const rs = new Readable()

  rs.push('a')
  rs.push(null)

  t.ok(Readable.isBackpressured(rs))
})
