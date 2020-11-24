const tape = require('tape')
const { Readable, Writable } = require('../')

const defaultSizes = [
  { name: 'buf512', item: Buffer.alloc(512), size: 512 },
  { name: 'number', item: 1, size: 1024 },
  { name: 'number-byteLength', item: 1, size: 512, byteLength: () => 512 },
  { name: 'number-byteLengthReadable', item: 1, size: 256, byteLength: () => 512, byteLengthExtended: () => 256 },
  { name: 'uint8-512', item: new Uint8Array(512), size: 512 },
  { name: 'uint32-64', item: new Uint32Array(64), size: 256 }
]

for (const { name, item, size, byteLength, byteLengthExtended } of defaultSizes) {
  tape(`readable ${name}`, function (t) {
    const r = new Readable({ byteLength, byteLengthReadable: byteLengthExtended })
    r.push(item)
    t.same(r._readableState.buffered, size)
    t.end()
  })
  tape(`writable ${name}`, function (t) {
    const w = new Writable({ byteLength, byteLengthWritable: byteLengthExtended })
    w.write(item)
    t.same(w._writableState.buffered, size)
    t.end()
  })
}
tape('byteLength receives readable item', function (t) {
  const obj = {}
  const r = new Readable({
    byteLength: data => {
      t.equals(obj, data)
      t.end()
    }
  })
  r.push(obj)
})
tape('byteLength receives writable item', function (t) {
  const obj = {}
  const r = new Writable({
    byteLength: data => {
      t.equals(obj, data)
      return 1
    }
  })
  r.write(obj)
  t.end()
})
