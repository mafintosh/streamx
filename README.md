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

## License

MIT
