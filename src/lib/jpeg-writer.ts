/**
 * JPEGバイナリに XMP メタデータを埋め込む
 *
 * JPEGはマーカーセグメントで構成される:
 *   FFD8 (SOI) | FF E1 (APP1 EXIF) | FF E1 (APP1 XMP) | ... | FFD9 (EOI)
 *
 * XMP は APP1 (0xFFE1) セグメントに
 * 識別子 "http://ns.adobe.com/xap/1.0/\0" を付けて格納する
 */

const XMP_MARKER = 0xff
const XMP_APP1 = 0xe1
const XMP_NAMESPACE = 'http://ns.adobe.com/xap/1.0/\0'
const SOI = 0xffd8
const EOI = 0xffd9

export function embedXmpToJpeg(jpegData: ArrayBuffer, xmpString: string): ArrayBuffer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const src = new Uint8Array(jpegData)

  // SOI チェック
  if (src[0] !== 0xff || src[1] !== 0xd8) {
    throw new Error('Invalid JPEG: missing SOI marker')
  }

  // 既存の XMP APP1 セグメントを除去しながら全セグメントを収集
  const segments = parseJpegSegments(src)
  const filteredSegments = segments.filter((seg) => !isXmpSegment(seg, src))

  // 新しい XMP セグメントを生成
  const xmpSegment = buildXmpSegment(xmpString)

  // SOI + XMP + 残りのセグメント (EOI以外) + EOI の順で結合
  const soiBytes = new Uint8Array([0xff, 0xd8])
  const eoiBytes = new Uint8Array([0xff, 0xd9])

  // SOI の次（EXIF APP1があればその前）に XMP を挿入
  const insertIndex = findXmpInsertIndex(filteredSegments)
  const parts: Uint8Array[] = [soiBytes]

  filteredSegments.forEach((seg, i) => {
    if (i === insertIndex) parts.push(xmpSegment)
    if (seg.marker !== SOI && seg.marker !== EOI) {
      parts.push(src.slice(seg.offset, seg.offset + seg.length))
    }
  })

  // insertIndex が末尾を超えた場合（セグメントが空の場合）
  if (insertIndex >= filteredSegments.length) parts.push(xmpSegment)

  parts.push(eoiBytes)

  return concatUint8Arrays(parts).buffer as ArrayBuffer
}

// ---------- 内部ユーティリティ ----------

type JpegSegment = {
  marker: number
  offset: number
  length: number  // マーカー2バイト + 長さフィールド含む全バイト数
}

function parseJpegSegments(data: Uint8Array): JpegSegment[] {
  const segments: JpegSegment[] = []
  let offset = 0

  // SOI
  segments.push({ marker: SOI, offset: 0, length: 2 })
  offset = 2

  while (offset < data.length - 1) {
    if (data[offset] !== 0xff) break
    const marker = (data[offset] << 8) | data[offset + 1]

    if (marker === EOI) {
      segments.push({ marker: EOI, offset, length: 2 })
      break
    }

    // マーカーによっては長さフィールドを持たない
    if (marker === 0xffda) {
      // SOS: 残り全部
      segments.push({ marker, offset, length: data.length - offset })
      break
    }

    if (offset + 3 >= data.length) break
    const segLen = (data[offset + 2] << 8) | data[offset + 3]
    // segLen は長さフィールド自身の2バイトを含む
    const totalLen = 2 + segLen

    segments.push({ marker, offset, length: totalLen })
    offset += totalLen
  }

  return segments
}

function isXmpSegment(seg: JpegSegment, data: Uint8Array): boolean {
  if (seg.marker !== (XMP_MARKER << 8 | XMP_APP1)) return false
  if (seg.length < 2 + 2 + XMP_NAMESPACE.length) return false
  const nsBytes = new TextEncoder().encode(XMP_NAMESPACE)
  const start = seg.offset + 4  // marker(2) + length(2)
  for (let i = 0; i < nsBytes.length; i++) {
    if (data[start + i] !== nsBytes[i]) return false
  }
  return true
}

function buildXmpSegment(xmpString: string): Uint8Array {
  const ns = new TextEncoder().encode(XMP_NAMESPACE)
  const xmpBytes = new TextEncoder().encode(xmpString)
  const payloadLen = ns.length + xmpBytes.length
  const segLen = 2 + payloadLen  // 長さフィールド(2) + payload

  const buf = new Uint8Array(2 + segLen)
  buf[0] = 0xff
  buf[1] = XMP_APP1
  buf[2] = (segLen >> 8) & 0xff
  buf[3] = segLen & 0xff
  buf.set(ns, 4)
  buf.set(xmpBytes, 4 + ns.length)
  return buf
}

function findXmpInsertIndex(_segments: JpegSegment[]): number {
  // SOI の直後、最初のマーカーの前に挿入
  return 1
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
