const test = require('brittle')
const { Duplex } = require('../')

test('destroy is never sync', function (t) {
  t.plan(1)

  let openCb = null

  const s = new Duplex({
    open (cb) {
      openCb = cb
    },
    predestroy () {
      openCb(new Error('stop'))
    }
  })

  s.resume()
  setImmediate(() => {
    s.destroy()
    s.on('close', () => t.pass('destroy was not sync'))
  })
})
