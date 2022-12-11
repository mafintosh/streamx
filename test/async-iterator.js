const test = require('brittle')
const { Readable } = require('../')

test('streams are async iterators', async function (t) {
  const data = ['a', 'b', 'c', null]
  const expected = data.slice(0)

  const r = new Readable({
    read (cb) {
      this.push(data.shift())
      cb(null)
    }
  })

  for await (const chunk of r) {
    t.is(chunk, expected.shift())
  }

  t.is(expected.shift(), null)
})

test('break out of iterator', async function (t) {
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
    t.is(chunk, 'tick')
    if (--runs === 0) break
  }
})

test('throw out of iterator', async function (t) {
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

  await t.exception(async function () {
    for await (const chunk of r) {
      t.is(chunk, 'tick')
      if (--runs === 0) throw new Error('stop')
    }
  })
})

test('intertesting timing', async function (t) {
  const r = new Readable({
    read (cb) {
      setImmediate(() => {
        this.push('b')
        this.push('c')
        this.push(null)
        cb(null)
      })
    },
    destroy (cb) {
      t.pass('destroying')
      cb(null)
    }
  })

  r.push('a')

  const iterated = []

  for await (const chunk of r) {
    iterated.push(chunk)
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  t.alike(iterated, ['a', 'b', 'c'])
})

test('intertesting timing with close', async function (t) {
  t.plan(3)

  const r = new Readable({
    read (cb) {
      setImmediate(() => {
        this.destroy(new Error('stop'))
        cb(null)
      })
    },
    destroy (cb) {
      t.pass('destroying')
      cb(null)
    }
  })

  r.push('a')

  const iterated = []

  await t.exception(async function () {
    for await (const chunk of r) {
      iterated.push(chunk)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  })

  t.alike(iterated, ['a'])
})

test('cleaning up a closed iterator', async function (t) {
  const r = new Readable()
  r.push('a')
  t.plan(1)

  const fn = async () => {
    for await (const chunk of r) { // eslint-disable-line
      r.destroy()
      await new Promise(resolve => r.once('close', resolve))
      t.is(chunk, 'a')
      return
    }
  }
  await fn()
})

test('using abort controller', async function (t) {
  function createInfinite (signal) {
    let count = 0
    const r = new Readable({ signal })
    r.push(count)
    const int = setInterval(() => r.push(count++), 5000)
    r.once('close', () => clearInterval(int))
    return r
  }
  const controller = new AbortController()
  const inc = []
  setImmediate(() => controller.abort())

  await t.exception(async function () {
    for await (const chunk of createInfinite(controller.signal)) {
      inc.push(chunk)
    }
  })

  t.alike(inc, [0])
})

test('from async iterator and to async iterator', async function (t) {
  const expected = []

  const stream = Readable.from(async function * () {
    yield 'a'
    yield 'b'
  }())

  for await (const data of stream) {
    expected.push(data)
  }

  t.alike(expected, ['a', 'b'])
})
