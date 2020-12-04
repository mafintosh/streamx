const tape = require('tape')
const { pipeline, pipelinePromise, Transform, Readable, Writable } = require('../')

tape('piping to a writable', function (t) {
  t.plan(1)
  const w = pipeline(
    Readable.from('hello'),
    new Writable({
      write (data, cb) {
        t.equals(data, 'hello')
        cb()
      }
    })
  )
  w.on('close', () => t.end())
})

tape('piping with error', function (t) {
  const r = new Readable()
  const w = new Writable()
  const err = new Error()
  pipeline(
    r,
    w,
    (error) => {
      t.equals(error, err)
      t.end()
    }
  )
  r.destroy(err)
})

tape('piping with final callback', function (t) {
  t.plan(1)
  pipeline(
    Readable.from('hello'),
    new Writable({
      write (data, cb) {
        t.equals(data, 'hello')
        cb()
      }
    }),
    () => t.end()
  )
})

tape('piping with transform stream inbetween', function (t) {
  t.plan(1)
  pipeline(
    [
      Readable.from('hello'),
      new Transform({
        transform (input, cb) {
          this.push(input.length)
          cb()
        }
      }),
      new Writable({
        write (data, cb) {
          t.equals(data, 5)
          cb()
        }
      })
    ],
    () => t.end()
  )
})

tape('piping to a writable', function (t) {
  t.plan(1)
  const w = pipeline(
    Readable.from('hello'),
    new Writable({
      write (data, cb) {
        t.equals(data, 'hello')
        cb()
      }
    })
  )
  w.on('close', () => t.end())
})

tape('piping to a writable + promise', async function (t) {
  t.plan(2)
  const r = Readable.from('hello')
  let closed = false
  r.on('close', () => {
    closed = true
  })
  await pipelinePromise(
    r,
    new Writable({
      write (data, cb) {
        t.equals(data, 'hello')
        cb()
      }
    })
  )
  t.ok(closed)
  t.end()
})
