const tape = require('tape')
const { Readable } = require('../')

tape('streams are async iterators', async function (t) {
  const data = ['a', 'b', 'c', null]
  const expected = data.slice(0)

  const r = new Readable({
    read (cb) {
      this.push(data.shift())
      cb(null)
    }
  })

  for await (const chunk of r) {
    t.same(chunk, expected.shift())
  }

  t.same(expected, [null])
  t.end()
})

tape('break out of iterator', async function (t) {
  const r = new Readable({
    read (cb) {
      this.push('tick')
      cb(null)
    },
    destroy (cb) {
      t.pass('destroying')
      cb(null)
    }
  })

  let runs = 10

  for await (const chunk of r) {
    t.same(chunk, 'tick')
    if (--runs === 0) break
  }

  t.end()
})

tape('throw out of iterator', async function (t) {
  const r = new Readable({
    read (cb) {
      this.push('tick')
      cb(null)
    },
    destroy (cb) {
      t.pass('destroying')
      cb(null)
    }
  })

  let runs = 10

  try {
    for await (const chunk of r) {
      t.same(chunk, 'tick')
      if (--runs === 0) throw new Error('stop')
    }
  } catch (err) {
    t.same(err, new Error('stop'))
  }

  t.end()
})
