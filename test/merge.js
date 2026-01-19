const test = require('brittle')
const { merge, Transform, Readable, pipeline } = require('../')

test('merge 1', function (t) {
  t.plan(4)

  const m = merge(Readable.from(['hello', 'world']))
  const buffered = []
  let ended = 0

  m.on('data', (data) => buffered.push(data))
  m.on('end', () => ended++)
  m.on('close', function () {
    t.pass('closed')
    t.alike(buffered, ['hello', 'world'])
    t.is(ended, 1)
    t.ok(m.destroyed)
  })
})

test('merge multiple', function (t) {
  t.plan(4)

  const r = new Readable()

  const m = merge(Readable.from(['hello', 'world']), Readable.from(['more', 'words']), r)
  const buffered = []
  let ended = 0

  r.push('read')
  r.push('push')
  r.push(null)

  m.on('data', (data) => buffered.push(data))
  m.on('end', () => ended++)
  m.on('close', function () {
    t.pass('closed')
    t.alike(buffered.sort(), ['hello', 'more', 'push', 'read', 'words', 'world'])
    t.is(ended, 1)
    t.ok(m.destroyed)
  })
})

test('merging with error', function (t) {
  t.plan(5)

  const r = new Readable()
  const m = merge(Readable.from(['hello', 'world']), r)
  r.destroy(new Error('bad things!'))

  const buffered = []
  let ended = 0
  let error = null

  m.on('data', (data) => buffered.push(data))
  m.on('end', () => ended++)
  m.on('error', (err) => (error = err))
  m.on('close', function () {
    t.pass('closed')
    t.alike(buffered, [])
    t.is(ended, 0)
    t.is(error.message, 'bad things!')
    t.ok(m.destroyed)
  })
})

test('merge with pipeline transform', function (t) {
  t.plan(4)

  const r = new Readable()

  const m = pipeline(
    merge(Readable.from(['hello', 'world']), Readable.from(['more', 'words']), r),
    new Transform({
      transform(data, cb) {
        cb(null, data.toUpperCase())
      }
    })
  )
  const buffered = []
  let ended = 0

  r.push('read')
  r.push('push')
  r.push(null)

  m.on('data', (data) => buffered.push(data))
  m.on('end', () => ended++)
  m.on('close', function () {
    t.pass('closed')
    t.alike(buffered.sort(), ['HELLO', 'MORE', 'PUSH', 'READ', 'WORDS', 'WORLD'])
    t.is(ended, 1)
    t.ok(m.destroyed)
  })
})
