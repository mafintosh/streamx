const test = require('brittle')
const compat = require('stream')
const { Readable, Writable } = require('../')

test('pipe to node stream', function (t) {
  t.plan(3)

  const expected = [
    'hi',
    'ho'
  ]

  const r = new Readable()
  const w = new compat.Writable({
    objectMode: true,
    write (data, enc, cb) {
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
    write (data, cb) {
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
    write (data, cb) {
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

test('pipe with callback - error case node stream', function (t) {
  t.plan(2)

  const r = new Readable()
  const w = new compat.Writable({
    write (data, enc, cb) {
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
    write (data, cb) {
      buffered.push(data)
      cb(null)
    },

    final () {
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
    write (data, cb) {
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
    read (cb) {
      this.push('test')

      if (++read === 20) {
        setTimeout(done, 10)
        return
      }

      cb(null)
    }
  })

  const w = new Writable({
    write (data, cb) {
      written++
      cb(null)
    }
  })

  r.pipe(w)

  function done () {
    t.is(written, read)
  }
})

test('unpipe from streamx where dest not null', (t) => {
  t.plan(5)

  const expected = [
    'hi'
  ]

  const r = new Readable()
  const w = new Writable({
    write (data, cb) {
      t.is(data, expected.shift())
      r.unpipe(w)
      t.ok(Readable.isPaused(r))
      r.push('ho')
      setTimeout(() => done(), 1)
      cb(null)
    }
  })

  r.pipe(w)
  r.push('hi')

  function done () {
    r.destroy()

    setTimeout(() => {
      t.is(expected.length, 0)
      t.ok(r.destroyed)
      t.absent(w.destroyed)
    }, 1)
  }
})

test('unpipe from node stream where dest not null', (t) => {
  t.plan(5)

  const expected = [
    'hi'
  ]

  const r = new Readable()
  const w = new compat.Writable({
    objectMode: true,
    write (data, _, cb) {
      t.is(data, expected.shift())
      r.unpipe(w)
      t.ok(Readable.isPaused(r))
      r.push('ho')
      setTimeout(() => done(), 1)
      cb(null)
    }
  })

  r.pipe(w)
  r.push('hi')

  function done () {
    r.destroy()

    setTimeout(() => {
      t.is(expected.length, 0)
      t.ok(r.destroyed)
      t.absent(w.destroyed)
    }, 1)
  }
})

test('unpipe from streamx where dest is null', (t) => {
  t.plan(5)

  const expected = [
    'hi'
  ]

  const r = new Readable()
  const w = new Writable({
    write (data, cb) {
      t.is(data, expected.shift())
      r.unpipe()
      t.ok(Readable.isPaused(r))
      r.push('ho')
      setTimeout(() => done(), 1)
      cb(null)
    }
  })

  r.pipe(w)
  r.push('hi')

  function done () {
    r.destroy()

    setTimeout(() => {
      t.is(expected.length, 0)
      t.ok(r.destroyed)
      t.absent(w.destroyed)
    }, 1)
  }
})
