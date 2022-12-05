const eos = require('end-of-stream')
const test = require('brittle')
const stream = require('../')
const finished = require('stream').finished

run(eos)
run(finished)

function run (eos) {
  if (!eos) return
  const name = eos === finished ? 'nodeStream.finished' : 'eos'

  test(name + ' readable', function (t) {
    t.plan(2)

    const r = new stream.Readable()
    let ended = false

    r.on('end', function () {
      ended = true
    })

    eos(r, function (err) {
      t.absent(err, 'no error')
      t.ok(ended)
    })

    r.push('hello')
    r.push(null)
    r.resume()
  })

  test(name + ' readable destroy', function (t) {
    t.plan(2)

    const r = new stream.Readable()
    let ended = false

    r.on('end', function () {
      ended = true
    })

    eos(r, function (err) {
      t.ok(err, 'had error')
      t.absent(ended)
    })

    r.push('hello')
    r.push(null)
    r.resume()
    r.destroy()
  })

  test(name + ' writable', function (t) {
    t.plan(2)

    const w = new stream.Writable()
    let finished = false

    w.on('finish', function () {
      finished = true
    })

    eos(w, function (err) {
      t.absent(err, 'no error')
      t.ok(finished)
    })

    w.write('hello')
    w.end()
  })

  test(name + ' writable destroy', function (t) {
    t.plan(3)

    const w = new stream.Writable()
    let finished = false

    w.on('finish', function () {
      finished = true
    })

    eos(w, function (err) {
      t.ok(err, 'had error')
      t.absent(finished)
    })

    w.write('hello')
    t.is(w.end(), w)
    w.destroy()
  })

  test(name + ' duplex', function (t) {
    t.plan(4)

    const s = new stream.Duplex()
    let ended = false
    let finished = false

    s.on('end', () => { ended = true })
    s.on('finish', () => { finished = true })

    eos(s, function (err) {
      t.absent(err, 'no error')
      t.ok(ended)
      t.ok(finished)
    })

    s.push('hello')
    s.push(null)
    s.resume()
    t.is(s.end(), s)
  })

  test(name + ' duplex + deferred s.end()', function (t) {
    t.plan(3)

    const s = new stream.Duplex()
    let ended = false
    let finished = false

    s.on('end', function () {
      ended = true
      setImmediate(() => s.end())
    })

    s.on('finish', () => { finished = true })

    eos(s, function (err) {
      t.absent(err, 'no error')
      t.ok(ended)
      t.ok(finished)
    })

    s.push('hello')
    s.push(null)
    s.resume()
  })

  test(name + ' duplex + deferred s.push(null)', function (t) {
    t.plan(3)

    const s = new stream.Duplex()
    let ended = false
    let finished = false

    s.on('finish', function () {
      finished = true
      setImmediate(() => s.push(null))
    })

    s.on('end', () => { ended = true })

    eos(s, function (err) {
      t.absent(err, 'no error')
      t.ok(ended)
      t.ok(finished)
    })

    s.push('hello')
    s.end()
    s.resume()
  })

  test(name + ' duplex destroy', function (t) {
    t.plan(3)

    const s = new stream.Duplex()
    let ended = false
    let finished = false

    s.on('end', () => { ended = true })
    s.on('finish', () => { finished = true })

    eos(s, function (err) {
      t.ok(err, 'had error')
      t.absent(ended)
      t.absent(finished)
    })

    s.push('hello')
    s.push(null)
    s.resume()
    s.end()
    s.destroy()
  })
}
