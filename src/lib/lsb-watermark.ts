/**
 * LSB ステガノグラフィー — PNG ピクセルの最下位ビットに著作者情報を埋め込む
 *
 * 対応フォーマット: RGB (colorType=2), RGBA (colorType=6), ビット深度8, 非インターレース
 * 非対応の場合は入力をそのまま返す（透かしなし）
 *
 * データ構造（ピクセル R/G/B の LSB に 1ビットずつ順番に格納）:
 *   MAGIC(10 bytes) + LENGTH(4 bytes, uint32 BE) + PAYLOAD(N bytes, UTF-8 JSON)
 */

// "RAKKANLSB" + version=1
const MAGIC = new Uint8Array([82, 65, 75, 75, 65, 78, 76, 83, 66, 1])
const HEADER_LEN = MAGIC.length + 4  // magic + uint32 length

export type LsbPayload = {
  n: string    // name
  c: string    // copyright
  s: string    // stampId
  u?: string   // usageTerms
  w?: string   // website
  e?: string   // email
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * PNG に LSB 透かしを埋め込む
 * 非対応フォーマット・容量不足の場合は入力をそのまま返す
 */
export async function embedLsbWatermark(
  pngBuffer: ArrayBuffer,
  payload: LsbPayload,
): Promise<ArrayBuffer> {
  const src = new Uint8Array(pngBuffer)
  const ihdr = parseIhdr(src)
  if (!canProcess(ihdr)) return pngBuffer

  const { width, height, colorType } = ihdr!
  const channels = colorType === 6 ? 4 : 3

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const bits = buildBitStream(payloadBytes)

  if (!hasCapacity(width, height, bits.length)) return pngBuffer

  const idatRaw = collectIdat(src)
  if (!idatRaw) return pngBuffer

  const pixels = await decompressZlib(idatRaw)
  embedBits(pixels, bits, width, height, channels)
  const compressed = await compressZlib(pixels)

  return rebuildPng(src, compressed)
}

/**
 * PNG から LSB 透かしを読み取る
 * 透かしが見つからない場合は null を返す
 */
export async function readLsbWatermark(
  pngBuffer: ArrayBuffer,
): Promise<LsbPayload | null> {
  const src = new Uint8Array(pngBuffer)
  const ihdr = parseIhdr(src)
  if (!canProcess(ihdr)) return null

  const { width, height, colorType } = ihdr!
  const channels = colorType === 6 ? 4 : 3

  const idatRaw = collectIdat(src)
  if (!idatRaw) return null

  const pixels = await decompressZlib(idatRaw)

  // ヘッダー（マジック + ペイロード長）を読み取る
  const headerBytes = extractBits(pixels, 0, HEADER_LEN * 8, width, height, channels)

  for (let i = 0; i < MAGIC.length; i++) {
    if (headerBytes[i] !== MAGIC[i]) return null
  }

  const payloadLen = readUint32(headerBytes, MAGIC.length)
  if (payloadLen === 0 || payloadLen > 65536) return null
  if (!hasCapacity(width, height, HEADER_LEN + payloadLen)) return null

  const payloadBytes = extractBits(
    pixels,
    HEADER_LEN * 8,
    payloadLen * 8,
    width, height, channels,
  )

  try {
    return JSON.parse(new TextDecoder().decode(payloadBytes)) as LsbPayload
  } catch {
    return null
  }
}

// ─── ビット操作 ─────────────────────────────────────────────────────────────

/** MAGIC + LENGTH + PAYLOAD を連結したビットストリームを返す */
function buildBitStream(payloadBytes: Uint8Array): Uint8Array {
  const header = new Uint8Array(HEADER_LEN)
  header.set(MAGIC)
  writeUint32(header, MAGIC.length, payloadBytes.length)
  return concat([header, payloadBytes])
}

/**
 * pixels（生スキャンライン）の各ピクセル R/G/B LSB に bits を埋め込む
 * row × (1 + width × channels) のレイアウト: 先頭1バイトがフィルタバイト
 */
function embedBits(
  pixels: Uint8Array,
  bits: Uint8Array,
  width: number,
  height: number,
  channels: number,
): void {
  const scanline = 1 + width * channels
  const totalBits = bits.length * 8
  let b = 0

  outer:
  for (let row = 0; row < height; row++) {
    const rowBase = row * scanline + 1  // フィルタバイトをスキップ
    for (let col = 0; col < width; col++) {
      const px = rowBase + col * channels
      for (let ch = 0; ch < 3; ch++) {  // R, G, B のみ（A はスキップ）
        if (b >= totalBits) break outer
        const bit = (bits[b >> 3] >> (7 - (b & 7))) & 1
        pixels[px + ch] = (pixels[px + ch] & 0xfe) | bit
        b++
      }
    }
  }
}

/**
 * pixels からビットを読み出す
 * startBit: 読み出し開始の絶対ビット位置（embedBits と同じ順序）
 * count: 読み出すビット数
 */
function extractBits(
  pixels: Uint8Array,
  startBit: number,
  count: number,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const out = new Uint8Array(Math.ceil(count / 8))
  const scanline = 1 + width * channels
  const bitsPerRow = width * 3  // 1 bit per channel × 3 channels

  for (let i = 0; i < count; i++) {
    const absIdx = startBit + i
    const row = Math.floor(absIdx / bitsPerRow)
    if (row >= height) break
    const col = Math.floor((absIdx % bitsPerRow) / 3)
    const ch = absIdx % 3
    const px = row * scanline + 1 + col * channels
    const bit = pixels[px + ch] & 1
    out[i >> 3] |= bit << (7 - (i & 7))
  }

  return out
}

// ─── PNG パース・再構築 ──────────────────────────────────────────────────────

type Ihdr = { width: number; height: number; bitDepth: number; colorType: number; interlace: number }

function parseIhdr(src: Uint8Array): Ihdr | null {
  if (src.length < 33) return null  // sig(8) + chunk(4+4+13+4)
  if (readUint32(src, 8) !== 13) return null
  if (String.fromCharCode(src[12], src[13], src[14], src[15]) !== 'IHDR') return null
  return {
    width:     readUint32(src, 16),
    height:    readUint32(src, 20),
    bitDepth:  src[24],
    colorType: src[25],
    interlace: src[28],
  }
}

/** RGB/RGBA 8bit 非インターレースのみ対応 */
function canProcess(ihdr: Ihdr | null): boolean {
  if (!ihdr) return false
  return (
    (ihdr.colorType === 2 || ihdr.colorType === 6) &&
    ihdr.bitDepth === 8 &&
    ihdr.interlace === 0
  )
}

function hasCapacity(width: number, height: number, byteCount: number): boolean {
  return width * height * 3 >= byteCount * 8
}

/** 全 IDAT チャンクのデータ部を連結して返す */
function collectIdat(src: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = []
  let offset = 8  // PNG シグネチャをスキップ

  while (offset + 12 <= src.length) {
    const len = readUint32(src, offset)
    const type = String.fromCharCode(src[offset + 4], src[offset + 5], src[offset + 6], src[offset + 7])
    if (type === 'IDAT') parts.push(src.slice(offset + 8, offset + 8 + len))
    if (type === 'IEND') break
    offset += 4 + 4 + len + 4
  }

  return parts.length > 0 ? concat(parts) : null
}

/** 全 IDAT を単一の新しい IDAT チャンクに置き換えた PNG を返す */
function rebuildPng(src: Uint8Array, newIdatData: Uint8Array): ArrayBuffer {
  const parts: Uint8Array[] = [src.slice(0, 8)]  // PNG シグネチャ
  let offset = 8
  let idatWritten = false

  while (offset + 12 <= src.length) {
    const len = readUint32(src, offset)
    const type = String.fromCharCode(src[offset + 4], src[offset + 5], src[offset + 6], src[offset + 7])
    const total = 4 + 4 + len + 4

    if (type === 'IDAT') {
      if (!idatWritten) {
        parts.push(buildIdatChunk(newIdatData))
        idatWritten = true
      }
      // 既存 IDAT はスキップ
    } else {
      parts.push(src.slice(offset, offset + total))
    }

    offset += total
    if (type === 'IEND') break
  }

  return concat(parts).buffer as ArrayBuffer
}

function buildIdatChunk(data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([73, 68, 65, 84])  // 'IDAT'
  const crc = crc32(typeBytes, data)
  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  writeUint32(chunk, 0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  writeUint32(chunk, 8 + data.length, crc)
  return chunk
}

// ─── zlib 圧縮・展開（Web Streams API） ─────────────────────────────────────

async function decompressZlib(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()
  writer.write(data as Uint8Array<ArrayBuffer>)
  writer.close()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return concat(chunks)
}

async function compressZlib(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  const reader = cs.readable.getReader()
  writer.write(data as Uint8Array<ArrayBuffer>)
  writer.close()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return concat(chunks)
}

// ─── バイナリユーティリティ ───────────────────────────────────────────────────

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0
}

function writeUint32(data: Uint8Array, offset: number, value: number): void {
  data[offset]     = (value >>> 24) & 0xff
  data[offset + 1] = (value >>> 16) & 0xff
  data[offset + 2] = (value >>> 8)  & 0xff
  data[offset + 3] =  value         & 0xff
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

function crc32(typeBytes: Uint8Array, dataBytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of typeBytes) {
    crc ^= b
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  for (const b of dataBytes) {
    crc ^= b
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
