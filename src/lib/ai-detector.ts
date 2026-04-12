import type { AiDetectionResult, AiSignal } from '../types'

/** AI生成ツールの CreatorTool / Software 値（部分一致） */
const AI_TOOL_PATTERNS = [
  'midjourney',
  'dall-e',
  'dall·e',
  'stable diffusion',
  'novelai',
  'adobe firefly',
  'adobe generative',
  'imagemagick ai',
  'bing image creator',
  'canva ai',
  'ideogram',
  'playground ai',
  'leonardo ai',
  'adobe photoshop generative',
  'comfyui',
  'invoke ai',
  'automatic1111',
]

/** Iptc4xmpExt:DigitalSourceType — AI生成を示す値 */
const AI_DIGITAL_SOURCE_TYPES = [
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedalgorithmicmedia',
  'trainedalgorithmicmedia',
  'algorithmicmedia',
  'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicmedia',
]

function isAiTool(value: string): boolean {
  const lower = value.toLowerCase()
  return AI_TOOL_PATTERNS.some((pattern) => lower.includes(pattern))
}

function isAiSourceType(value: string): boolean {
  const lower = value.toLowerCase()
  return AI_DIGITAL_SOURCE_TYPES.some((t) => lower.includes(t))
}

/**
 * exifr で取得したメタデータオブジェクトから AI生成シグナルを検出する
 */
export function detectAiSignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: Record<string, any> | null,
): AiDetectionResult {
  if (!meta) return { isAiGenerated: false, signals: [] }

  const signals: AiSignal[] = []

  // --- DigitalSourceType (IPTC Extension) ---
  const dst =
    meta['DigitalSourceType'] ??
    meta['Iptc4xmpExt:DigitalSourceType'] ??
    meta['digitalsourcetype']
  if (dst && isAiSourceType(String(dst))) {
    signals.push({
      field: 'DigitalSourceType',
      value: String(dst),
      reason: 'IPTC の DigitalSourceType が AI 生成メディアを示しています',
    })
  }

  // --- CreatorTool (XMP) ---
  const creatorTool = meta['CreatorTool'] ?? meta['xmp:CreatorTool']
  if (creatorTool && isAiTool(String(creatorTool))) {
    signals.push({
      field: 'CreatorTool',
      value: String(creatorTool),
      reason: `CreatorTool に AI 生成ツール名が含まれています`,
    })
  }

  // --- Software (EXIF) ---
  const software = meta['Software']
  if (software && isAiTool(String(software))) {
    signals.push({
      field: 'Software',
      value: String(software),
      reason: `EXIF の Software フィールドに AI 生成ツール名が含まれています`,
    })
  }

  // --- PNG tEXt / iTXt チャンク (AUTOMATIC1111 等) ---
  const pngParams =
    meta['parameters'] ??
    meta['Parameters'] ??
    meta['Comment'] ??
    meta['UserComment']
  if (pngParams) {
    const str = String(pngParams)
    // AUTOMATIC1111 は "Steps: XX, Sampler: ..." 形式でパラメータを埋め込む
    if (/\bsteps\s*:\s*\d+/i.test(str) && /\bsampler\b/i.test(str)) {
      signals.push({
        field: 'parameters',
        value: str.slice(0, 120) + (str.length > 120 ? '…' : ''),
        reason: 'PNG メタデータに Stable Diffusion の生成パラメータが検出されました',
      })
    }
  }

  return {
    isAiGenerated: signals.length > 0,
    signals,
  }
}
