const tape = require('tape')
const { pipeline, pipelinePromise, Transform, Readable, Writable } = require('../')

tape('one entry pipeline (no-array)', async function (t) {
  const r = pipeline(Readable.from('hello'))
  t.plan(1)
  for await (const entry of r) {
    t.equals(entry, 'hello')
  }
  t.end()
})

tape('piping to a writable', async function (t) {
  t.plan(1)
  const r = pipeline(
    Readable.from('hello'),
    new Writable({
      write (data, cb) {
        t.equals(data, 'hello')
        cb()
      }
    })
  )
  r.on('close', () => t.end())
})

tape('piping with error', async function (t) {
  const r = new Readable()
  const err = new Error()
  pipeline(
    r,
    (error) => {
      t.equals(error, err)
      t.end()
    }
  )
  r.destroy(err)
})

tape('piping with final callback', async function (t) {
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

tape('piping with transform stream inbetween', async function (t) {
  t.plan(1)
  pipeline(
    [
      'hello',
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

tape('pipeline to promise', async function (t) {
  t.plan(1)
  await pipelinePromise(
    'hello',
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
  )
  t.end()
})

tape('pipeline starting with writable', async function (t) {
  t.plan(1)
  try {
    await pipelinePromise(
      new Writable(),
      new Transform()
    )
  } catch (err) {
    t.equals(err.message, 'Can not pipe #0 to #1 as #0 is not readable.')
  }
  t.end()
})

tape('piping two readables', async function (t) {
  t.plan(1)
  try {
    await pipelinePromise(
      'hello',
      Readable.from('world')
    )
  } catch (err) {
    t.equals(err.message, 'Can not pipe #0 to #1 as #1 is not writable.')
  }
  t.end()
})

tape('piping from writable', async function (t) {
  t.plan(1)
  try {
    await pipelinePromise(
      'hello',
      new Writable(),
      new Writable()
    )
  } catch (err) {
    t.equals(err.message, 'Can not pipe #1 to #2 as #1 is not readable.')
  }
  t.end()
})

tape('piping from writable', async function (t) {
  t.plan(1)
  try {
    await pipelinePromise(
      'hello',
      {}
    )
  } catch (err) {
    t.equals(err.message, 'Can not pipe #0 to #1 as #1 is not a valid target stream.')
  }
  t.end()
})
