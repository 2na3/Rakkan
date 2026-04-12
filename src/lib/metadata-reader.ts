import ExifReader from 'exifr'
import { detectAiSignals } from './ai-detector'
import { readC2pa } from './c2pa-reader'
import type { AiDetectionResult } from '../types'

/**
 * 画像ファイルのメタデータを読み取り、AI生成チェックを行う
 *
 * 検出優先順位:
 *   1. C2PA マニフェスト（AI生成アサーションがあれば即リジェクト）
 *   2. XMP / EXIF / IPTC メタデータ
 */
export async function readMetadata(file: File): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any> | null
  aiDetection: AiDetectionResult
}> {
  // ── 1. C2PA チェック ──────────────────────────────────────────────────────
  try {
    const c2pa = await readC2pa(file)
    if (c2pa.isAiGenerated) {
      return {
        raw: null,
        aiDetection: {
          isAiGenerated: true,
          signals: c2pa.signals.map((reason) => ({
            field: 'C2PA',
            value: c2pa.generator ?? 'unknown',
            reason,
          })),
        },
      }
    }
  } catch {
    // C2PA パース失敗は無視して次のチェックへ
  }

  // ── 2. XMP / EXIF / IPTC チェック ─────────────────────────────────────────
  try {
    const raw = await ExifReader.parse(file, {
      xmp: true,
      iptc: true,
      exif: true,
      icc: false,
      jfif: false,
      tiff: true,
      mergeOutput: true,
    })

    const aiDetection = detectAiSignals(raw)
    return { raw, aiDetection }
  } catch {
    // メタデータなし・パース失敗は AI生成なし扱い
    return { raw: null, aiDetection: { isAiGenerated: false, signals: [] } }
  }
}
