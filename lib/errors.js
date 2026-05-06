module.exports = class StreamError extends Error {
  constructor(msg, code, fn = StreamError) {
    super(msg)

    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  static isStreamDestroyed(err) {
    return err && err.code === 'STREAM_DESTROYED'
  }

  static isPrematureClose(err) {
    return err && err.code === 'PREMATURE_CLOSE'
  }

  static isAborted(err) {
    return err && err.code === 'ABORTED'
  }

  static isPipeUsed(err) {
    return err && err.code === 'PIPE_USED'
  }

  static isPipelineMissing(err) {
    return err && err.code === 'PIPELINE_MISSING'
  }

  get name() {
    return 'StreamError'
  }

  static STREAM_DESTROYED() {
    return new StreamError('Stream was destroyed', 'STREAM_DESTROYED', StreamError.STREAM_DESTROYED)
  }

  static PREMATURE_CLOSE(msg = 'Premature close') {
    return new StreamError(msg, 'PREMATURE_CLOSE', StreamError.PREMATURE_CLOSE)
  }

  static ABORTED() {
    return new StreamError('Stream aborted', 'ABORTED', StreamError.ABORTED)
  }

  static PIPE_USED() {
    return new StreamError('Can only pipe to one destination', 'PIPE_USED', StreamError.PIPE_USED)
  }

  static PIPELINE_MISSING() {
    return new StreamError(
      'Pipeline requires at least 2 streams',
      'PIPELINE_MISSING',
      StreamError.PIPELINE_MISSING
    )
  }
}
