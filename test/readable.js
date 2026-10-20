const test = require('brittle')
const b4a = require('b4a')
const { Readable, Writable, isDisturbed } = require('../')

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

for (const queued of [0, 1, 33]) {
  test('unshift returns mapped data with ' + queued + ' queued chunks', async function (t) {
    const mapped = []
    const r = new Readable({
      map(data) {
        mapped.push(data)
        return JSON.parse(data)
      }
    })
    const input = Array.from({ length: queued + 1 }, (_, id) => JSON.stringify({ id }))
    for (const data of input) r.push(data)

    r.read()
    await nextImmediate()
    const first = r.read()
    t.alike(first, { id: 0 })
    r.unshift(first)
    r.push(null)

    const output = []
    for await (const data of r) output.push(data)
    t.is(output[0], first, 'the returned object retains its identity')
    t.alike(output, input.map(JSON.parse), 'all queued data retains its order')
    t.alike(mapped, input, 'each input is mapped only once')
  })
}

test('unshift bypasses a map that skips input', async function (t) {
  const mapped = []
  const r = new Readable({
    map(data) {
      mapped.push(data)
      return null
    }
  })
  const returned = { id: 1 }
  r.push('skipped')
  r.unshift(returned)
  r.push(null)

  const output = []
  for await (const data of r) output.push(data)
  t.alike(output, [returned])
  t.is(output[0], returned)
  t.alike(mapped, ['skipped'])
})

test('unshift leaves an incomplete decoder sequence untouched', async function (t) {
  const r = new Readable({ encoding: 'utf-8' })
  const buffer = b4a.from('🦄')
  r.push(b4a.from('hello'))
  r.push(buffer.subarray(0, 2))
  r.read()
  await nextImmediate()
  const first = r.read()
  t.is(first, 'hello')
  r.unshift(first)
  r.push(buffer.subarray(2))
  r.push(null)

  const output = []
  for await (const data of r) output.push(data)
  t.alike(output, ['hello', '🦄'])
})

test('unshift accounts for mapped object byte lengths', async function (t) {
  const mapped = []
  const r = new Readable({
    highWaterMark: 5,
    map(size) {
      mapped.push(size)
      return { size }
    },
    byteLength(data) {
      return data.size
    }
  })
  r.push(3)
  r.push(4)
  r.read()
  await nextImmediate()

  t.ok(Readable.isBackpressured(r))
  const first = r.read()
  t.absent(Readable.isBackpressured(r))
  r.unshift(first)
  t.ok(Readable.isBackpressured(r))
  t.is(r.read(), first)
  t.absent(Readable.isBackpressured(r))
  t.alike(r.read(), { size: 4 })
  t.absent(Readable.isBackpressured(r))
  t.alike(mapped, [3, 4])
  r.push(null)
  r.resume()
})

test('unshift preserves mapped chunks when piping', async function (t) {
  const mapped = []
  const r = new Readable({
    map(data) {
      mapped.push(data)
      return data + 10
    }
  })
  r.push(1)
  r.push(2)
  r.unshift(0)
  r.push(null)

  const output = []
  const w = new Writable({
    highWaterMark: 1,
    write(data, cb) {
      output.push(data)
      setImmediate(cb)
    }
  })
  await new Promise((resolve, reject) => {
    r.pipe(w, (err) => (err ? reject(err) : resolve()))
  })
  t.alike(output, [0, 11, 12])
  t.alike(mapped, [1, 2])
})

for (const queued of [false, true]) {
  test(
    'unshift leaves queued data intact if byteLength throws, queued=' + queued,
    async function (t) {
      const error = new Error('bad chunk')
      const r = new Readable({
        highWaterMark: 5,
        byteLength(data) {
          if (data.bad) throw error
          return data.size
        }
      })
      const first = { size: 3 }
      const last = { size: 4 }
      if (queued) r.push(first)
      await t.exception(() => r.unshift({ bad: true }), error)
      t.absent(Readable.isBackpressured(r))
      r.push(last)
      t.is(Readable.isBackpressured(r), queued)
      r.push(null)

      const output = []
      for await (const data of r) output.push(data)
      t.alike(output, queued ? [first, last] : [last])
    }
  )
}

test('unshift null ends an empty readable without mapping', async function (t) {
  const r = new Readable({ map: () => t.fail('null is not mapped') })
  r.unshift(null)
  const output = []
  for await (const data of r) output.push(data)
  t.alike(output, [])
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
