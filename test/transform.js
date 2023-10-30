const test = require('brittle')
const { Transform } = require('../')

test('default transform teardown when saturated', async function (t) {
  const stream = new Transform({
    transform (data, cb) {
      cb(null, data)
    }
  })

  for (let i = 0; i < 20; i++) {
    stream.write('hello')
  }

  await new Promise(resolve => setImmediate(resolve))

  stream.destroy()

  await new Promise(resolve => stream.on('close', resolve))

  t.pass('close fired')
})
