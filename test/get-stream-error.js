const test = require('brittle')
const { Readable, getStreamError } = require('../')

test('getStreamError, no errors', function (t) {
  const stream = new Readable()

  t.is(getStreamError(stream), null)
})

test('getStreamError, basic', function (t) {
  const stream = new Readable()
  stream.on('error', () => {})

  const err = new Error('stop')
  stream.destroy(err)

  t.is(getStreamError(stream), err)
})

test('getStreamError, only explicit errors by default', function (t) {
  const stream = new Readable()

  stream.destroy()

  t.absent(getStreamError(stream))
})

test('getStreamError, get premature destroy', function (t) {
  const stream = new Readable()

  stream.destroy()

  const err = getStreamError(stream, { all: true })
  t.alike(err.message, 'Stream was destroyed')
})
