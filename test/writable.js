const tape = require('tape')
const { Writable } = require('../')

tape('opens before writes', function (t) {
  t.plan(2)
  const trace = []
  const stream = new Writable({
    open (cb) {
      trace.push('open')
      return cb(null)
    },
    write (data, cb) {
      trace.push('write')
      return cb(null)
    }
  })
  stream.on('close', () => {
    t.equals(trace.length, 2)
    t.equals(trace[0], 'open')
  })
  stream.write('data')
  stream.end()
})
