/**
 * C2PA（Coalition for Content Provenance and Authenticity）マニフェスト読み取り
 *
 * 外部ライブラリを使わず、バイナリを直接パースして JUMBF ボックスを検出する。
 * - JPEG: APP11 セグメント (0xFF 0xEB) に JUMBF が埋め込まれる
 * - PNG:  caBX チャンクに JUMBF が埋め込まれる
 *
 * C2PA マニフェストが見つかった場合、JSON テキストを抽出して AI 生成シグナルを検出する。
 * （CBOR エンコードされたマニフェストは非対応。主要なサービスは JSON を使用している）
 */

export type C2paReadResult = {
  found: boolean           // C2PA マニフェストが存在するか
  isAiGenerated: boolean   // AI 生成を示すアサーションが含まれるか
  generator?: string       // 検出されたジェネレーター名
  signals: string[]        // 検出された AI シグナルの説明
}

/** AI 生成を示す C2PA アサーション・文字列パターン */
const AI_C2PA_PATTERNS = [
  // 既知の AI ジェネレーター名
  'adobe firefly',
  'dall-e',
  'dall·e',
  'midjourney',
  'stable diffusion',
  'imagen',
  'bing image creator',
  'firefly',
  // C2PA アサーション種別
  'c2pa.ai.generative',
  'c2pa.ai_generative',
  'trainedalgorithmicmedia',
  'algorithmicmedia',
  // IPTC DigitalSourceType（AI生成）
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedalgorithmicmedia',
]

// ─── バイナリユーティリティ ──────────────────────────────────────────────────

function readUint32BE(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0
}

function bytesToString(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(data)
}

function concatenate(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

// ─── JUMBF 解析 ─────────────────────────────────────────────────────────────

/**
 * JUMBF バイナリからテキスト（JSON LD）部分を抽出する。
 * JUMBF ボックス構造: [length:4][type:4][...content...]
 * Description box: type='jumd', label は null 終端文字列
 * Content box: type='json', 'cbor', etc.
 */
function extractTextFromJumbf(data: Uint8Array): string {
  const result: string[] = []
  let i = 0

  while (i + 8 <= data.length) {
    let boxLen = readUint32BE(data, i)

    // boxLen=0 は「末尾まで」を意味する
    if (boxLen === 0) boxLen = data.length - i
    // boxLen=1 は 8バイト拡張長（未対応、スキップ）
    if (boxLen === 1 || boxLen < 8 || i + boxLen > data.length) break

    const boxType = String.fromCharCode(data[i + 4], data[i + 5], data[i + 6], data[i + 7])
    const boxContent = data.slice(i + 8, i + boxLen)

    if (boxType === 'json') {
      result.push(bytesToString(boxContent))
    } else if (boxType === 'jumb') {
      // ネストされた JUMBF を再帰的に処理
      result.push(extractTextFromJumbf(boxContent))
    } else if (boxType === 'jumd') {
      // Description box: UUID(16) + toggles(1) + label(null終端)
      if (boxContent.length > 17) {
        const labelBytes = boxContent.slice(17)
        const nullIdx = labelBytes.indexOf(0)
        const label = bytesToString(nullIdx >= 0 ? labelBytes.slice(0, nullIdx) : labelBytes)
        result.push(label)
      }
    } else {
      // その他のボックスも文字列として試みる（ASCII テキストを拾う）
      result.push(bytesToString(boxContent))
    }

    i += boxLen
  }

  return result.join('\n')
}

// ─── フォーマット別パーサー ──────────────────────────────────────────────────

/**
 * JPEG: APP11 セグメント (0xFF 0xEB) を全て収集して連結する
 * C2PA は複数の APP11 にまたがる場合がある
 */
function extractJpegJumbf(data: Uint8Array): Uint8Array | null {
  const segments: Uint8Array[] = []
  let i = 2  // SOI をスキップ

  while (i + 3 < data.length) {
    if (data[i] !== 0xFF) { i++; continue }

    const marker = data[i + 1]

    if (marker === 0xDA) break  // SOS: スキャンデータ開始、以降にマーカーなし

    if (marker >= 0xD0 && marker <= 0xD9) {
      i += 2
      continue
    }

    if (i + 3 >= data.length) break
    const segLen = (data[i + 2] << 8) | data[i + 3]

    if (marker === 0xEB) {
      // APP11: 先頭2バイトが "JP" (0x4A 0x50) なら JUMBF の可能性が高い
      const payload = data.slice(i + 4, i + 2 + segLen)
      segments.push(payload)
    }

    i += 2 + segLen
  }

  if (segments.length === 0) return null
  return concatenate(segments)
}

/**
 * PNG: caBX チャンクを探す
 */
function extractPngJumbf(data: Uint8Array): Uint8Array | null {
  let i = 8  // PNG シグネチャをスキップ

  while (i + 12 <= data.length) {
    const chunkLen = readUint32BE(data, i)
    const chunkType = String.fromCharCode(data[i + 4], data[i + 5], data[i + 6], data[i + 7])

    if (chunkType === 'caBX') {
      return data.slice(i + 8, i + 8 + chunkLen)
    }
    if (chunkType === 'IEND') break

    i += 12 + chunkLen
  }
  return null
}

// ─── AI シグナル検出 ─────────────────────────────────────────────────────────

function analyzeManifestText(text: string): Pick<C2paReadResult, 'isAiGenerated' | 'generator' | 'signals'> {
  const lower = text.toLowerCase()
  const signals: string[] = []

  for (const pattern of AI_C2PA_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      signals.push(`C2PA マニフェストに AI 生成シグナルを検出: "${pattern}"`)
    }
  }

  // ジェネレーター名の抽出（JSON の "name" フィールドから）
  const generatorMatch = text.match(/"(?:name|product)"\s*:\s*"([^"]{3,64})"/i)
  const generator = generatorMatch?.[1]

  return { isAiGenerated: signals.length > 0, generator, signals }
}

// ─── 公開 API ────────────────────────────────────────────────────────────────

export async function readC2pa(file: File): Promise<C2paReadResult> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  let jumbf: Uint8Array | null = null

  if (file.type === 'image/jpeg') {
    jumbf = extractJpegJumbf(data)
  } else if (file.type === 'image/png') {
    jumbf = extractPngJumbf(data)
  }

  if (!jumbf) {
    return { found: false, isAiGenerated: false, signals: [] }
  }

  // JUMBF 内に "c2pa" ラベルがあるかを確認（C2PA マニフェストの判定）
  const rawText = bytesToString(jumbf)
  const hasC2paLabel = rawText.toLowerCase().includes('c2pa')

  if (!hasC2paLabel) {
    return { found: false, isAiGenerated: false, signals: [] }
  }

  // テキスト（JSON-LD）を抽出して AI シグナルを解析
  const manifestText = extractTextFromJumbf(jumbf)
  const analysis = analyzeManifestText(manifestText || rawText)

  return {
    found: true,
    ...analysis,
  }
}
