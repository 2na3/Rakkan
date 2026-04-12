/**
 * スタンプID生成ロジック
 *
 * フォーマット: rkn-{YYYYMMDDHHmmss}-{imageHash8}-{deviceToken6}
 *
 * - 処理日時: 後から処理すると新しい日時になるため「オリジン性」の根拠になる
 * - imageHash: どの画像を処理したかを紐づける（画像が変わればハッシュも変わる）
 * - deviceToken: 端末ごとに固定のトークン（別端末での処理と区別できる）
 */

async function sha256hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getDeviceToken(): string {
  const key = 'rakkan_device_token'
  const stored = localStorage.getItem(key)
  if (stored) return stored
  // 初回のみ生成して保存
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  localStorage.setItem(key, token)
  return token
}

function formatDateCompact(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  )
}

export async function generateStampId(imageBuffer: ArrayBuffer): Promise<string> {
  const dateStr = formatDateCompact(new Date())
  const fullHash = await sha256hex(imageBuffer)
  const imageHash = fullHash.slice(0, 8)
  const deviceToken = getDeviceToken().slice(0, 6)
  return `rkn-${dateStr}-${imageHash}-${deviceToken}`
}

/** スタンプIDから日時を人間が読める形式に変換 */
export function parseStampDate(stampId: string): string {
  const match = stampId.match(/^rkn-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-/)
  if (!match) return ''
  const [, year, month, day, hour, min, sec] = match
  return `${year}.${month}.${day}  ${hour}:${min}:${sec}`
}
