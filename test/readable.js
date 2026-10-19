const test = require('brittle')
const b4a = require('b4a')
const { Readable, isDisturbed } = require('../')

test('ondata', function (t) {
  t.plan(4)

  const r = new Readable()
  const buffered = []
  let ended = 0

  r.push('hello')
  r.push('world')
  r.push(null)

  r.on('data', (data) => buffered.push(data))
  r.on('end', () => ended++)
  r.on('close', function () {
    t.pass('closed')
    t.alike(buffered, ['hello', 'world'])
    t.is(ended, 1)
    t.ok(r.destroyed)
  })
})

test('pause', async function (t) {
  const r = new Readable()
  const buffered = []
  t.is(Readable.isPaused(r), true, 'starting off paused')
  r.on('data', (data) => buffered.push(data))
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
    open(cb) {
      opened = true
      cb(null)
    }
  })
  await nextImmediate()
  t.absent(opened)
  r.read()
  await nextImmediate()
  t.ok(opened)
})

test('eager open', async function (t) {
  let opened = false
  const r = new Readable({
    open(cb) {
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
  t.plan(3)

  const r = new Readable({
    read(cb) {
      this.push('hello')
      cb(null)
    },
    destroy(cb) {
      t.pass('destroyed')
      cb(null)
    }
  })

  r.once('readable', function () {
    t.is(r.read(), 'hello')
    r.destroy()
    t.is(r.read(), null)
  })
})

test('both push and the cb needs to be called for re-reads', function (t) {
  t.plan(2)

  let once = true

  const r = new Readable({
    read(cb) {
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
  r.on('data', (data) => inc.push(data))
  r.on('end', function () {
    t.alike(inc, [1, 2, 3])
  })
})

test('from buffer', function (t) {
  t.plan(1)

  const inc = []
  const r = Readable.from(Buffer.from('hello'))
  r.on('data', (data) => inc.push(data))
  r.on('end', function () {
    t.alike(inc, [Buffer.from('hello')])
  })
})

test('from async iterator', function (t) {
  t.plan(1)

  async function* test() {
    yield 1
    yield 2
    yield 3
  }

  const inc = []
  const r = Readable.from(test())
  r.on('data', (data) => inc.push(data))
  r.on('end', function () {
    t.alike(inc, [1, 2, 3])
  })
})

test('from array with highWaterMark', function (t) {
  const r = Readable.from([1, 2, 3], { highWaterMark: 1 })
  t.is(r._readableState.highWaterMark, 1)
})

test('from async iterator with highWaterMark', function (t) {
  async function* test() {
    yield 1
  }

  const r = Readable.from(test(), { highWaterMark: 1 })
  t.is(r._readableState.highWaterMark, 1)
})

test('unshift', async function (t) {
  const r = new Readable()
  r.pause()
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
    map: (input) => JSON.parse(input)
  })
  r.push('{ "foo": 1 }')
  for await (const obj of r) {
    // eslint-disable-line
    t.alike(obj, { foo: 1 })
    break
  }
})

test('use mapReadable to map data', async function (t) {
  const r = new Readable({
    map: () => t.fail('.mapReadable has priority'),
    mapReadable: (input) => JSON.parse(input)
  })
  r.push('{ "foo": 1 }')
  for await (const obj of r) {
    // eslint-disable-line
    t.alike(obj, { foo: 1 })
    break
  }
})

test('live stream', function (t) {
  t.plan(3)

  const r = new Readable({
    read(cb) {
      this.push('data')
      this.push('data')
      this.push('data')
      // assume cb is called way later
    }
  })

  r.on('data', function (data) {
    t.is(data, 'data')
  })
})

test('live stream with readable', function (t) {
  t.plan(3)

  const r = new Readable({
    read(cb) {
      this.push('data')
      this.push('data')
      this.push('data')
      // assume cb is called way later
    }
  })

  r.on('readable', function () {
    let data
    while ((data = r.read()) !== null) t.is(data, 'data')
  })
})

test('resume a stalled stream', function (t) {
  t.plan(1)

  const expected = []
  let once = true

  const r = new Readable({
    read(cb) {
      if (once) {
        once = false
        this.push('data')
        expected.push('data')
        return cb(null)
      }

      for (let i = 0; i < 20; i++) {
        this.push('data')
        expected.push('data')
      }

      // pretend its stalled
    }
  })

  const collected = []

  r.once('data', function (data) {
    r.pause()
    collected.push(data)
    setImmediate(() => {
      r.on('data', function (data) {
        collected.push(data)
        if (collected.length === 21) {
          t.alike(collected, expected)
        }
      })
      r.resume()
    })
  })
})

test('no read-ahead with pause/resume', function (t) {
  t.plan(4)

  let tick = 0

  const r = new Readable({
    highWaterMark: 0,
    read(cb) {
      this.push('tick: ' + ++tick)
      cb(null)
    }
  })

  r.once('data', function () {
    t.is(tick, 1)
    r.pause()
    setImmediate(() => {
      t.is(tick, 1)
      r.resume()
      r.once('data', function () {
        t.is(tick, 2)
        r.pause()
        setImmediate(() => {
          t.is(tick, 2)
        })
      })
    })
  })
})

test('no read-ahead with async iterator', async function (t) {
  let tick = 0

  const r = new Readable({
    highWaterMark: 0,
    read(cb) {
      this.push('tick: ' + ++tick)
      if (tick === 10) this.push(null)
      cb(null)
    }
  })

  let expectedTick = 0
  for await (const data of r) {
    t.is(tick, ++expectedTick)
    t.is(data, 'tick: ' + tick)
    await nextImmediate()
  }

  t.is(expectedTick, 10)
})

test('setEncoding', async function (t) {
  const r = new Readable()

  r.setEncoding('utf-8')
  const buffer = b4a.from('hællå wørld!')
  for (let i = 0; i < buffer.byteLength; i++) {
    r.push(buffer.subarray(i, i + 1))
  }
  r.push(null)
  const expected = b4a.toString(buffer).split('')
  for await (const data of r) {
    t.is(data, expected.shift())
  }
  t.is(expected.length, 0)
})

test('setEncoding flushes incomplete UTF-8 at end', async function (t) {
  for (const text of ['ø', '€', '🦄']) {
    const character = b4a.from(text)
    for (let length = 1; length < character.byteLength; length++) {
      const input = b4a.concat([b4a.from('prefix '), character.subarray(0, length)])
      for (const split of [false, true]) {
        const r = new Readable({ encoding: 'utf8' })
        if (split) {
          for (const byte of input) r.push(b4a.from([byte]))
        } else {
          r.push(input)
        }
        r.push(null)

        let actual = ''
        for await (const chunk of r) actual += chunk
        t.is(actual, b4a.toString(input), `${text}, ${length} bytes, split: ${split}`)
      }
    }
  }
})

test('setEncoding keeps the final decoded chunk queued while paused', async function (t) {
  const r = new Readable({ encoding: 'utf8', highWaterMark: 1 })
  const chunks = []
  let ended = false
  const closed = new Promise((resolve) => r.once('close', resolve))

  r.on('data', function (chunk) {
    chunks.push(chunk)
    if (chunks.length === 1) r.pause()
  })
  r.on('end', () => (ended = true))

  r.push(b4a.from('prefix'))
  r.push(b4a.from([0xe2, 0x82]))
  r.push(null)
  await nextImmediate()

  t.alike(chunks, ['prefix'])
  t.absent(ended, 'end waits for the queued replacement character')
  r.resume()
  await closed
  t.alike(chunks, ['prefix', '\ufffd'])
  t.ok(ended)
})

test('setEncoding maps the final decoded chunk once', async function (t) {
  const mapped = []
  const r = new Readable({
    encoding: 'utf8',
    map(chunk) {
      mapped.push(chunk)
      return { text: chunk }
    }
  })
  r.push(b4a.from([0xf0, 0x9f, 0xa6]))
  r.push(null)
  r.push(null)

  const chunks = []
  for await (const chunk of r) chunks.push(chunk)
  t.alike(chunks, [{ text: '\ufffd' }])
  t.alike(mapped, ['\ufffd'])
})

test('setEncoding can skip the final decoded chunk through map', async function (t) {
  const mapped = []
  const r = new Readable({
    encoding: 'utf8',
    map(chunk) {
      mapped.push(chunk)
      return null
    }
  })
  r.push(b4a.from([0xc3]))
  r.push(null)

  const chunks = []
  for await (const chunk of r) chunks.push(chunk)
  t.alike(chunks, [])
  t.alike(mapped, ['\ufffd'])
})

test('setEncoding does not flush pending bytes when destroyed', async function (t) {
  const r = new Readable({ encoding: 'utf8' })
  const chunks = []
  let ended = false
  const closed = new Promise((resolve) => r.once('close', resolve))
  r.on('data', (chunk) => chunks.push(chunk))
  r.on('end', () => (ended = true))
  r.push(b4a.from([0xe2, 0x82]))
  r.destroy()
  await closed
  t.alike(chunks, [])
  t.absent(ended)
})

test('setEncoding respects existing map', function (t) {
  t.plan(1)

  const r = new Readable({
    encoding: 'utf-8',
    map(data) {
      return JSON.parse(data)
    }
  })

  r.push('{"hello":"world"}')
  r.once('data', function (data) {
    t.alike(data, { hello: 'world' })
  })
})

test('setEncoding empty string', async function (t) {
  t.plan(1)

  const r = new Readable()

  r.setEncoding('utf-8')
  const buffer = b4a.from('')
  r.push(buffer)
  r.push(null)

  for await (const data of r) {
    t.is(data, '')
  }
})

test('is disturbed', function (t) {
  const r = new Readable()
  t.is(isDisturbed(r), false)

  r.push('hello')
  t.is(isDisturbed(r), false)

  r.resume()
  t.is(isDisturbed(r), true)

  r.pause()
  t.is(isDisturbed(r), true)
})

test('is disturbed after immediate destroy', function (t) {
  t.plan(3)

  const r = new Readable()
  t.is(isDisturbed(r), false)

  r.destroy()
  t.is(isDisturbed(r), true)

  r.on('close', () => t.is(isDisturbed(r), true))
})

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve))
}
