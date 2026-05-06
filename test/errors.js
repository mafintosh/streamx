const test = require('brittle')
const StreamError = require('../lib/errors')

test('can make errors', function (t) {
  {
    const err = StreamError.STREAM_DESTROYED()

    t.is(err.code, 'STREAM_DESTROYED')
    t.is(err.message, 'Stream was destroyed')
    t.ok(StreamError.isStreamDestroyed(err))
  }

  {
    const err = StreamError.PREMATURE_CLOSE()

    t.is(err.code, 'PREMATURE_CLOSE')
    t.is(err.message, 'Premature close')
    t.ok(StreamError.isPrematureClose(err))
  }

  {
    const err = StreamError.ABORTED()

    t.is(err.code, 'ABORTED')
    t.is(err.message, 'Stream aborted')
    t.ok(StreamError.isAborted(err))
  }

  {
    const err = StreamError.PIPE_USED()

    t.is(err.code, 'PIPE_USED')
    t.is(err.message, 'Can only pipe to one destination')
    t.ok(StreamError.isPipeUsed(err))
  }

  {
    const err = StreamError.PIPELINE_MISSING()

    t.is(err.code, 'PIPELINE_MISSING')
    t.is(err.message, 'Pipeline requires at least 2 streams')
    t.ok(StreamError.isPipelineMissing(err))
  }
})
