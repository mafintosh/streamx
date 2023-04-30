const test = require('brittle')
const { compose, Transform, Readable, Writable } = require('../')

test('basic', function (t) {
  t.plan(3)

  const pipeline = compose(
    new Transform({
      transform (data, cb) {
        t.is(data.toString(), 'hello')
        cb(null, data.toString().toUpperCase())
      }
    }),
    new Transform({
      transform (data, cb) {
        t.is(data.toString(), 'HELLO')
        cb(null, data.toString().toLowerCase())
      }
    })
  )

  pipeline.write('hello')
  pipeline.on('data', function (data) {
    t.is(data.toString(), 'hello')
    t.end()
  })
})

test('3 times', function (t) {
  t.plan(4)

  const pipeline = compose(
    new Transform({
      transform (data, cb) {
        t.is(data.toString(), 'hello')
        cb(null, data.toString().toUpperCase())
      }
    }),
    new Transform({
      transform (data, cb) {
        t.is(data.toString(), 'HELLO')
        cb(null, data.toString().toLowerCase())
      }
    }),
    new Transform({
      transform (data, cb) {
        t.is(data.toString(), 'hello')
        cb(null, data.toString().toUpperCase())
      }
    })
  )

  pipeline.write('hello')
  pipeline.on('data', function (data) {
    t.is(data.toString(), 'HELLO')
    t.end()
  })
})

test('destroy', function (t) {
  const pipeline = compose(
    new Transform(),
    new Transform({
      destroy () {
        t.ok(true)
        t.end()
      }
    })
  )

  pipeline.destroy()
})

test('close', function (t) {
  const stream = new Transform()
  const pipeline = compose(new Transform(), stream)

  pipeline.on('error', function (err) {
    t.is(err.message, 'lol')
    t.end()
  })

  stream.emit('error', new Error('lol'))
})

// TODO: What is the equivalent in Streamx?
// test('end waits for last one', function(t) {
//   let ran = false

//   const a = new Transform()
//   const b = new Transform()
//   const c = new Transform({
//     transform(data, cb) {
//       setTimeout(function() {
//         ran = true
//         cb()
//       }, 100)
//     }
//   })

//   const pipeline = compose(a, b, c)

//   pipeline.write('foo')
//   pipeline.end(function() {
//     t.ok(ran)
//     t.end()
//   })

//   t.ok(!ran)
// })

test('always wait for finish', function (t) {
  const a = new Readable({
    read () {}
  })
  a.push('hello')

  const pipeline = compose(a, new Transform(), new Transform())
  let ran = false

  pipeline.on('finish', function () {
    t.ok(ran)
    t.end()
  })

  setTimeout(function () {
    ran = true
    a.push(null)
  }, 100)
})

test('preserves error again', function (t) {
  const ws = new Writable()
  const rs = new Readable()

  ws._write = function (data, cb) {
    cb(null)
  }

  let once = true
  rs._read = function () {
    process.nextTick(function () {
      if (!once) return
      once = false
      rs.push('hello world')
    })
  }

  const composeErr = compose(
    new Transform(),
    new Transform({
      transform (chunk, cb) {
        cb(new Error('test'))
      }
    }),
    ws
  )

  rs.pipe(composeErr)
    .on('error', function (err) {
      t.ok(err)
      t.ok(err.message !== 'premature close', 'does not close with premature close')
      t.end()
    })
})
