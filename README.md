# streamx

An iteration of the Node.js core streams that adds proper lifecycles to streams
whilst maintaining most backwards compat.

```
npm install @mafintosh/streamx
```

## Usage

``` js
const { Readable } = require('mafintosh/streamx')

const rs = new Readable({
  read (cb) {
    this.push('Cool data')
    cb(null)
  }
})

rs.on('data', data => console.log('data:', data))
```

## API

#### `rs = new stream.Readable([options])`

Create a new readable stream.

Options include:

```
{
  highWaterMark: 16384, // max buffer size in bytes
  map: (data) => data, // optional function to map input data
  byteLength: (data) => size // optional functoin that calculates the byte size of input data
}
```

In addition you can pass the `open`, `read`, and `destroy` functions as shorthands in
the constructor instead of overwrite the methods below.

The default byteLength function returns the byte length of buffers and `1024`
for any other object. This means the buffer will contain around 16 non buffers
or buffers worth 16kb when full if the defaults are used.

#### `rs._read(cb)`

This function is called when the stream wants you to push new data.
Overwrite this and add your own read logic.
You should call the callback when you are fully done with the read.

Can also be set using `options.read` in the constructor.

#### `drained = rs.push(data)`

Push new data to the stream. Returns true if the buffer is not full
and you should push more data if you can.

If you call `rs.push(null)` you signal to the stream that no more
data will be pushed and that you want to end the stream.

#### `data = rs.read()`

Read a piece of data from the stream buffer. If the buffer is currently empty
`null` will be returned and you should wait for `readable` to be emitted before
trying again. If the stream has been ended it will also return `null`.

#### `rs._open(cb)`

This function is called once before the first read is issued. Use this function
to implement your own open logic.

Can also be set using `options.open` in the constructor.

#### `rs._destroy(cb)`

This function is called just before the stream is fully destroyed. You should
use this to implement whatever teardown logic you need. The final part of the
stream life cycle is always to call destroy itself so this function will always
be called wheather or not the stream ends gracefully or forcefully.

Can also be set using `options.destroy` in the constructor.

#### `rs.destroy([error])`

Forcefully destroy the stream. Will call `_destroy` as soon as all pending reads have finished.
Once the stream is fully destroyed `close` will be emitted.

#### `rs.pause()`

Pauses the stream. You will only need to call this if you want to pause a resumed stream.

#### `rs.resume()`

Will start consuming the stream as fast possible.

#### `writableStream = rs.pipe(writableStream, [callback])`

Efficently pipe the readable stream to a writable stream (can be Node.js core stream or a stream from this package).
If you provide a callback the callback is called when the pipeline has fully finished with an optional error in case
it failed.

To cancel the pipeline destroy either of the streams.

#### `rs.on('data', data)`

Emitted when data is being read from the stream. If you attach a data handler you are implicitly resuming the stream.

#### `rs.on('end')`

Emitted when the readable stream has ended and no data is left in it's buffer.

#### `rs.on('close')`

Emitted when the readable stream has fully closed (i.e. it's destroy function has completed)

#### `rs.on('error', err)`

Emitted if any of the stream operations fail with an error. `close` is always emitted right after this.

#### `rs.destroyed`

Boolean property indicating wheather or not this stream has been destroyed.

#### `ws = new stream.Writable([options])`

#### `s = new stream.Duplex([options])`

#### `ts = new stream.Transform([options])`

## License

MIT
