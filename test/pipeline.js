const test = require('brittle')
const { pipeline, pipelinePromise, Transform, Readable, Writable } = require('../')

test('piping to a writable', function (t) {
  t.plan(2)

  const w = pipeline(
    Readable.from('hello'),
    new Writable({
      write(data, cb) {
        t.is(data, 'hello')
        cb()
      }
    })
  )
  w.on('close', () => t.pass('closed'))
})

test('piping with error', function (t) {
  t.plan(1)

  const r = new Readable()
  const w = new Writable()
  const err = new Error()
  pipeline(r, w, (error) => {
    t.alike(error, err)
  })
  r.destroy(err)
})

test('piping with final callback', function (t) {
  t.plan(2)

  pipeline(
    Readable.from('hello'),
    new Writable({
      write(data, cb) {
        t.is(data, 'hello')
        cb()
      }
    }),
    () => t.pass('ended')
  )
})

test('piping with transform stream inbetween', function (t) {
  t.plan(2)

  pipeline(
    [
      Readable.from('hello'),
      new Transform({
        transform(input, cb) {
          this.push(input.length)
          cb()
        }
      }),
      new Writable({
        write(data, cb) {
          t.is(data, 5)
          cb()
        }
      })
    ],
    () => t.pass('ended')
  )
})

test('piping to a writable', function (t) {
  t.plan(2)

  const w = pipeline(
    Readable.from('hello'),
    new Writable({
      write(data, cb) {
        t.is(data, 'hello')
        cb()
      }
    })
  )
  w.on('close', () => t.pass('closed'))
})

test('piping to a writable + promise', async function (t) {
  t.plan(2)

  const r = Readable.from('hello')
  let closed = false
  r.on('close', () => {
    closed = true
  })
  await pipelinePromise(
    r,
    new Writable({
      write(data, cb) {
        t.is(data, 'hello')
        cb()
      }
    })
  )
  t.ok(closed)
})
