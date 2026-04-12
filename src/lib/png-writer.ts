/**
 * PNG バイナリに XMP メタデータを埋め込む
 *
 * PNG はチャンクで構成される:
 *   [8バイト シグネチャ] | IHDR | ... | IEND
 *
 * XMP は iTXt チャンクとして格納する:
 *   keyword: "XML:com.adobe.xmp"
 *   compression flag: 0 (非圧縮)
 *   compression method: 0
 *   language tag: "" (空)
 *   translated keyword: "" (空)
 *   text: XMP XML文字列
 */

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const XMP_KEYWORD = 'XML:com.adobe.xmp'

export function embedXmpToPng(pngData: ArrayBuffer, xmpString: string): ArrayBuffer {
  const src = new Uint8Array(pngData)

  // シグネチャチェック
  for (let i = 0; i < 8; i++) {
    if (src[i] !== PNG_SIGNATURE[i]) throw new Error('Invalid PNG signature')
  }

  const chunks = parsePngChunks(src)

  // 既存の XMP iTXt チャンクを除去
  const filtered = chunks.filter((c) => !isXmpITXtChunk(c, src))

  // IEND の直前に XMP チャンクを挿入
  const xmpChunk = buildXmpITXtChunk(xmpString)
  const iendIndex = filtered.findIndex((c) => chunkType(c, src) === 'IEND')
  const insertAt = iendIndex === -1 ? filtered.length : iendIndex

  const parts: Uint8Array[] = [PNG_SIGNATURE]
  filtered.forEach((c, i) => {
    if (i === insertAt) parts.push(xmpChunk)
    parts.push(src.slice(c.offset, c.offset + c.length))
  })
  if (insertAt >= filtered.length) parts.push(xmpChunk)

  return concatUint8Arrays(parts).buffer as ArrayBuffer
}

// ---------- 内部ユーティリティ ----------

type PngChunk = { offset: number; length: number }

function parsePngChunks(data: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = []
  let offset = 8  // シグネチャをスキップ

  while (offset + 12 <= data.length) {
    const dataLen = readUint32(data, offset)
    const chunkLen = 4 + 4 + dataLen + 4  // length + type + data + CRC
    chunks.push({ offset, length: chunkLen })
    const type = readChunkType(data, offset + 4)
    offset += chunkLen
    if (type === 'IEND') break
  }

  return chunks
}

function chunkType(chunk: PngChunk, data: Uint8Array): string {
  return readChunkType(data, chunk.offset + 4)
}

function readChunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])
}

function isXmpITXtChunk(chunk: PngChunk, data: Uint8Array): boolean {
  if (chunkType(chunk, data) !== 'iTXt') return false
  const dataStart = chunk.offset + 8
  const keyword = XMP_KEYWORD
  for (let i = 0; i < keyword.length; i++) {
    if (data[dataStart + i] !== keyword.charCodeAt(i)) return false
  }
  return data[dataStart + keyword.length] === 0  // null terminator
}

function buildXmpITXtChunk(xmpString: string): Uint8Array {
  const encoder = new TextEncoder()
  const keywordBytes = encoder.encode(XMP_KEYWORD)
  const xmpBytes = encoder.encode(xmpString)

  // iTXt データ: keyword\0 + compression_flag(1) + compression_method(1) +
  //               language_tag\0 + translated_keyword\0 + text
  const dataLen =
    keywordBytes.length + 1 +  // keyword + \0
    1 +                         // compression flag (0)
    1 +                         // compression method (0)
    1 +                         // language tag \0
    1 +                         // translated keyword \0
    xmpBytes.length

  const chunkData = new Uint8Array(dataLen)
  let pos = 0
  chunkData.set(keywordBytes, pos); pos += keywordBytes.length
  chunkData[pos++] = 0  // null terminator
  chunkData[pos++] = 0  // compression flag: not compressed
  chunkData[pos++] = 0  // compression method
  chunkData[pos++] = 0  // language tag (empty, null terminated)
  chunkData[pos++] = 0  // translated keyword (empty, null terminated)
  chunkData.set(xmpBytes, pos)

  const crc = crc32(new TextEncoder().encode('iTXt'), chunkData)

  // チャンク全体: length(4) + type(4) + data(n) + CRC(4)
  const chunk = new Uint8Array(4 + 4 + dataLen + 4)
  writeUint32(chunk, 0, dataLen)
  chunk.set(new TextEncoder().encode('iTXt'), 4)
  chunk.set(chunkData, 8)
  writeUint32(chunk, 8 + dataLen, crc)

  return chunk
}

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0
}

function writeUint32(data: Uint8Array, offset: number, value: number): void {
  data[offset]     = (value >>> 24) & 0xff
  data[offset + 1] = (value >>> 16) & 0xff
  data[offset + 2] = (value >>> 8)  & 0xff
  data[offset + 3] =  value         & 0xff
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// CRC-32 (PNG標準)
function crc32(typeBytes: Uint8Array, dataBytes: Uint8Array): number {
  const combined = new Uint8Array(typeBytes.length + dataBytes.length)
  combined.set(typeBytes)
  combined.set(dataBytes, typeBytes.length)
  let crc = 0xffffffff
  for (const byte of combined) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
