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
    const err = StreamError.BAD_ARGUMENT()

    t.is(err.code, 'BAD_ARGUMENT')
    t.is(err.message, 'Bad argument')
    t.ok(StreamError.isBadArgument(err))
  }

  {
    const err = StreamError.BAD_ARGUMENT('Pipeline requires at least 2 streams')

    t.is(err.code, 'BAD_ARGUMENT')
    t.is(err.message, 'Pipeline requires at least 2 streams')
    t.ok(StreamError.isBadArgument(err))
  }
})
