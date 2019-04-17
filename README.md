# stable-stream

WIP - nothing to see here

```
npm install stable-stream
```

## Usage

``` js
const { Readable } = require('stable-stream')

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

In addition you can pass the open, read, and destroy functions as shorthands in
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

#### `ws = new stream.Writable([options])`

#### `s = new stream.Duplex([options])`

#### `ts = new stream.Transform([options])`

## License

MIT
