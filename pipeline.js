const assert = require('nanoassert')
const { PIPE_PREMATURE_CLOSE } = require('./errors')

module.exports = pipeline

pipeline.couple = couple

function pipeline (streams, cb) {
  if (!Array.isArray(streams)) {
    streams = Array.protototype.slice.call(streams)
    if (typeof streams[streams.length - 1] === 'function') cb = streams.pop()
  }

  assert(streams.length > 1, 'Pipeline needs two streams minimum')

  for (let i = 1; i < streams.length; i++) {
    pipe(streams[i - 1], streams[i], i === streams.length - 1 ? cb : noop)
  }

  return streams[streams.length - 1]
}

function pipe (from, to, cb) {
  if (from.readableState && from.readableState.STABLE_STREAM === true) return from.pipe(to, cb)

  from.pipe(to)
  couple(from, to, cb || noop)

  return to
}

function couple (from, to, cb) {
  coupleLegacy(from, to, cb)
}

function coupleLegacy (from, to, cb) {
  to.on('close', onerror)
  to.on('error', onerror)
  to.on('finish', onsuccess)

  function onerror (err) {
    if (err && typeof err !== 'object') err = null
    if (from.destroy) from.destroy(err || PIPE_PREMATURE_CLOSE)
  }

  function onsuccess () {
    if (from.destroy) from.destroy(null)
    to.removeListener('close', onerror)
    to.removeListener('error', onerror)
    to.on('error', noop) // do not crash on errors as we are done now
    cb(null)
  }
}

function noop () {}
