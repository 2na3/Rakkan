/**
 * スタンプID生成ロジック
 *
 * フォーマット: rkn-{YYYYMMDDHHmmss}-{compositeHash8}-{deviceToken6}
 *
 * - 処理日時: 後から処理すると新しい日時になるため「オリジン性」の根拠になる
 * - compositeHash: 画像バイナリ・処理日時・デバイストークン（フル12桁）を
 *                  結合してハッシュ化。スタンプIDに表示されないデバイストークンが
 *                  含まれるため、画像と日時を知っていても第三者には再現できない。
 * - deviceToken: 端末ごとに固定のトークン（別端末での処理と区別できる）
 */

const enc = new TextEncoder()

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

/** 画像バイナリ・日時・デバイストークンを結合して単一の ArrayBuffer にする */
function buildHashInput(imageBuffer: ArrayBuffer, dateStr: string, deviceToken: string): ArrayBuffer {
  const dateBytes    = enc.encode(dateStr)
  const tokenBytes   = enc.encode(deviceToken)
  const combined     = new Uint8Array(imageBuffer.byteLength + dateBytes.byteLength + tokenBytes.byteLength)
  combined.set(new Uint8Array(imageBuffer), 0)
  combined.set(dateBytes,  imageBuffer.byteLength)
  combined.set(tokenBytes, imageBuffer.byteLength + dateBytes.byteLength)
  return combined.buffer
}

export async function generateStampId(imageBuffer: ArrayBuffer): Promise<string> {
  const dateStr     = formatDateCompact(new Date())
  const deviceToken = getDeviceToken()                    // フル12桁をハッシュに使用
  const hashInput   = buildHashInput(imageBuffer, dateStr, deviceToken)
  const fullHash    = await sha256hex(hashInput)
  const compositeHash = fullHash.slice(0, 8)
  return `rkn-${dateStr}-${compositeHash}-${deviceToken.slice(0, 6)}`  // 表示は6桁のみ
}

/** スタンプIDから日時を人間が読める形式に変換 */
export function parseStampDate(stampId: string): string {
  const match = stampId.match(/^rkn-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-/)
  if (!match) return ''
  const [, year, month, day, hour, min, sec] = match
  return `${year}.${month}.${day}  ${hour}:${min}:${sec}`
}
