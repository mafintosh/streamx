const test = require('brittle')
const compat = global.Bare ? null : require('stream')
const { Readable, Writable } = require('../')
const StreamError = require('../lib/errors')

test('pipe to node stream', { skip: !compat }, function (t) {
  t.plan(3)

  const expected = ['hi', 'ho']

  const r = new Readable()
  const w = new compat.Writable({
    objectMode: true,
    write(data, enc, cb) {
      t.is(data, expected.shift())
      cb(null)
    }
  })

  r.push('hi')
  r.push('ho')
  r.push(null)

  r.pipe(w)

  w.on('finish', function () {
    t.is(expected.length, 0)
  })
})

test('pipe with callback - error case', function (t) {
  t.plan(2)

  const r = new Readable()
  const w = new Writable({
    write(data, cb) {
      cb(new Error('blerg'))
    }
  })

  r.pipe(w, function (err) {
    t.pass('callback called')
    t.alike(err, new Error('blerg'))
  })

  r.push('hello')
  r.push('world')
  r.push(null)
})

test('pipe with callback - error case with destroy', function (t) {
  t.plan(2)

  const r = new Readable()
  const w = new Writable({
    write(data, cb) {
      w.destroy(new Error('blerg'))
      cb(null)
    }
  })

  r.pipe(w, function (err) {
    t.pass('callback called')
    t.alike(err, new Error('blerg'))
  })

  r.push('hello')
  r.push('world')
})

test('pipe with callback - error case node stream', { skip: !compat }, function (t) {
  t.plan(2)

  const r = new Readable()
  const w = new compat.Writable({
    write(data, enc, cb) {
      cb(new Error('blerg'))
    }
  })

  r.pipe(w, function (err) {
    t.pass('callback called')
    t.alike(err, new Error('blerg'))
  })

  r.push('hello')
  r.push('world')
  r.push(null)
})

test('simple pipe', function (t) {
  t.plan(2)

  const buffered = []

  const r = new Readable()
  const w = new Writable({
    write(data, cb) {
      buffered.push(data)
      cb(null)
    },

    final() {
      t.pass('final called')
      t.alike(buffered, ['hello', 'world'])
    }
  })

  r.pipe(w)

  r.push('hello')
  r.push('world')
  r.push(null)
})

test('pipe with callback', function (t) {
  t.plan(3)

  const buffered = []

  const r = new Readable()
  const w = new Writable({
    write(data, cb) {
      buffered.push(data)
      cb(null)
    }
  })

  r.pipe(w, function (err) {
    t.pass('callback called')
    t.is(err, null)
    t.alike(buffered, ['hello', 'world'])
  })

  r.push('hello')
  r.push('world')
  r.push(null)
})

test('pipe continues if read is "blocked"', function (t) {
  t.plan(1)

  let written = 0
  let read = 0

  const r = new Readable({
    read(cb) {
      this.push('test')

      if (++read === 20) {
        setTimeout(done, 10)
        return
      }

      cb(null)
    }
  })

  const w = new Writable({
    write(data, cb) {
      written++
      cb(null)
    }
  })

  r.pipe(w)

  function done() {
    t.is(written, read)
  }
})

test('pipe errors on already used', function (t) {
  t.plan(2)

  const r = new Readable()
  const w = new Writable()
  const w2 = new Writable()

  try {
    r.pipe(w)
    r.pipe(w2)
  } catch (e) {
    t.is(e.message, 'Can only pipe to one destination')
    t.ok(StreamError.isBadArgument(e))
  }
})

test('pipe rejects options before attaching or opening', async function (t) {
  let opened = 0
  let piping = 0
  const written = []
  const r = new Readable({
    open(cb) {
      opened++
      cb(null)
    }
  })
  const w = new Writable({
    write(data, cb) {
      written.push(data)
      cb(null)
    }
  })

  r.on('error', () => {})
  w.on('error', () => {})
  r.on('piping', () => piping++)

  let error
  try {
    r.pipe(w, { end: false })
  } catch (err) {
    error = err
  }

  t.ok(StreamError.isBadArgument(error))
  t.is(error && error.message, 'Callback must be a function')

  await new Promise((resolve) => setTimeout(resolve, 0))
  t.is(opened, 0)
  t.is(piping, 0)

  if (!error) {
    r.destroy()
    w.destroy()
    return
  }

  const finished = new Promise((resolve) => w.on('finish', resolve))
  t.is(r.pipe(w), w)
  r.push('payload')
  r.push(null)
  await finished
  t.alike(written, ['payload'])
})

test('pipe rejects invalid callbacks', function (t) {
  for (const callback of [{}, [], false, 0, 'callback']) {
    const r = new Readable()
    const w = new Writable()
    r.on('error', () => {})
    w.on('error', () => {})

    let error
    try {
      r.pipe(w, callback)
    } catch (err) {
      error = err
    }

    t.ok(StreamError.isBadArgument(error))
    t.is(error && error.message, 'Callback must be a function')
    r.destroy()
    w.destroy()
  }
})

test('pipe accepts null and undefined callbacks', async function (t) {
  for (const callback of [null, undefined]) {
    const written = []
    const r = new Readable()
    const w = new Writable({
      write(data, cb) {
        written.push(data)
        cb(null)
      }
    })
    const finished = new Promise((resolve) => w.on('finish', resolve))

    t.is(r.pipe(w, callback), w)
    r.push('payload')
    r.push(null)
    await finished
    t.alike(written, ['payload'])
  }
})
