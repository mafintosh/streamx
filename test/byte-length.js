const test = require('brittle')
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
  test(`readable ${name}`, function (t) {
    const r = new Readable({ byteLength, byteLengthReadable: byteLengthExtended })
    r.push(item)
    t.is(r._readableState.buffered, size)
  })

  test(`writable ${name}`, function (t) {
    const w = new Writable({ byteLength, byteLengthWritable: byteLengthExtended })
    w.write(item)
    t.is(w._writableState.buffered, size)
  })
}

test('byteLength receives readable item', function (t) {
  t.plan(1)

  const obj = {}
  const r = new Readable({
    byteLength: data => {
      t.alike(obj, data)
    }
  })
  r.push(obj)
})

test('byteLength receives writable item', function (t) {
  t.plan(2)

  const obj = {}
  const r = new Writable({
    byteLength: data => {
      t.alike(obj, data)
      return 1
    }
  })
  r.write(obj)
})
