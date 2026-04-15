import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, DownloadSimple } from '@phosphor-icons/react'
import { parseStampDate } from '../lib/stamp-id'
import type { CreatorProfile } from '../types'

// パスポートの寸法（portrait = 縦向き基準）
const W = 224   // portrait width  → landscape height after rotation
const H = 316   // portrait height → landscape width after rotation

type Props = {
  preview: string
  fileName: string
  profile: CreatorProfile
  stampId: string
  onClose: () => void
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function PassportModal({ preview, fileName, profile, stampId, onClose }: Props) {
  // アニメーション制御用 boolean state（クラス付け外しではなく transition で制御）
  const [isRotating,     setIsRotating]     = useState(false)  // 回転 + X シフト開始
  const [frontCoverOpen, setFrontCoverOpen] = useState(false)  // 表紙前面: 0° → -90°
  const [showBackCover,  setShowBackCover]  = useState(false)  // 表紙裏面: -90° → 0°
  const [isCoverClosing, setCoverClosing]   = useState(false)  // 裏表紙を逆回転で畳む + X シフト戻り
  const [isCoverGone,    setCoverGone]      = useState(false)  // 全カバーを DOM から除去
  const [showStamp,      setShowStamp]      = useState(false)
  const [showButtons,    setShowButtons]    = useState(false)
  const certCaptureRef = useRef<HTMLDivElement>(null)
  const stampDate = parseStampDate(stampId)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setIsRotating(true); setCoverGone(true)
      setShowStamp(true);  setShowButtons(true)
      return
    }
    // タイミング設計（ms）:
    //   400  : 回転（900ms）& 表紙前面 0°→-90°（delay 150ms + 600ms）
    //   1150 : 表紙前面 edge-on → 表紙裏面 -90°→0° 開始（600ms）
    //   1750 : 表紙裏面が 0° に到達（全幅で証明書の真上に展開）
    //           → 見開き（裏表紙+証明書）を画面中央に寄せる translateY(-W/2)
    //   2150 : 400ms 見開き鑑賞後、裏表紙を逆回転で畳み始める（600ms）
    //           → 同時に translateY を 0 に戻しページを畳んだ感
    //   2850 : カバー全消去（2150+600+100）
    //   3000 : ハンコ表示
    //   3500 : ボタン表示
    const t = [
      setTimeout(() => { setIsRotating(true); setFrontCoverOpen(true) }, 400),
      setTimeout(() => setShowBackCover(true),  1150),
      setTimeout(() => setCoverClosing(true),   1950),
      setTimeout(() => setCoverGone(true),      2850),
      setTimeout(() => setShowStamp(true),      3000),
      setTimeout(() => setShowButtons(true),    3500),
    ]
    return () => t.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const handleDownload = useCallback(async () => {
    const el = certCaptureRef.current
    if (!el) return
    try {
      await document.fonts.ready
      const { toPng } = await import('html-to-image')

      const url = await toPng(el, {
        pixelRatio: 2,
        style: { clipPath: 'none', borderRadius: '10px' },
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName.replace(/\.[^.]+$/, '')}_rakkan_stamp.png`
      a.click()
    } catch (err) {
      console.error('[Rakkan] カード保存に失敗しました:', err)
    }
  }, [fileName])

  return (
    <div
      role="dialog" aria-modal aria-label="著作権証明パスポート"
      className="fixed inset-0 flex items-center justify-center z-modal anim-overlay-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <button
        type="button" onClick={onClose} aria-label="閉じる"
        className="absolute top-4 right-4 rounded-full p-2 text-white/50 hover:text-white hover:bg-white/10 transition duration-fast z-tooltip"
      >
        <X size={20} />
      </button>

      <div className="flex flex-col items-center gap-6">

        {/* anim-passport-in を外側ラッパーに分離して rotate transition との競合を回避。
             さらに内側に縦シフトラッパーを入れ、見開き状態を画面中央に寄せる。 */}
        <div style={{ perspective: '1000px' }}>
          <div className="anim-passport-in">
          {/* Y シフトラッパー:
              回転開始と同時に translateY(W/2) で下にずらし見開きを中央に寄せる。
              isCoverClosing で translateY(0) に戻し「ページを畳む」感を演出する。
              transition は常に active（React 同一レンダリング問題を回避）。 */}
          <div style={{
            transform: (isRotating && !isCoverClosing)
              ? `translateY(${W / 2}px)`
              : 'translateY(0px)',
            transition: 'transform 900ms cubic-bezier(0.2, 0, 0.2, 1)',
          }}>
          <div
            style={{
              width: W,
              height: H,
              position: 'relative',
              transformStyle: 'preserve-3d',
              willChange: 'transform',
              transform: isRotating ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 900ms cubic-bezier(0.2, 0, 0.2, 1)',
            }}
          >

            {/* ── Layer 1: 証明書ページ（下・めくれない） ─── */}
            {/* コンテナが +90° 回転するのに合わせ、内部コンテンツを -90° 事前回転。
                transform: translateY(H) rotate(-90deg) は、H×W の landscape を
                W×H の portrait 内に正確に収める写像になっている（数学的証明: 点(x,y)→(y, H-x)）*/}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: 10,
              overflow: 'hidden',
              backgroundColor: 'var(--passport-cream)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{
                width: H,          // landscape の幅 = portrait の高さ
                height: W,         // landscape の高さ = portrait の幅
                transformOrigin: '0 0',
                transform: `translateY(${H}px) rotate(-90deg)`,
                fontFamily: 'var(--font-sans)',
              }}>
                <CertificateContent
                  preview={preview}
                  profile={profile}
                  stampId={stampId}
                  stampDate={stampDate}
                  showStamp={showStamp}
                />
              </div>
            </div>

            {/* ── Layer 2 & 3: 表紙（裏面 + 前面） ─── */}
            {!isCoverGone && (
              <>
                {/* Layer 2: 表紙裏面
                    証明書と同じサイズ（W×H）で portrait 左外側（left: -W）に配置。
                    コンテナ回転後は証明書の真上に landscape W 分の高さで展開。
                    isCoverClosing で逆回転しながらフェードアウトする。 */}
                <div style={{
                  position: 'absolute',
                  left: -W,
                  top: 0,
                  width: W,
                  height: H,
                  borderRadius: 10,
                  backgroundColor: 'var(--passport-navy)',
                  // ヒンジ: この要素の右辺(portrait x=0) = landscape 上辺中央
                  transformOrigin: '100% 50%',
                  willChange: 'transform',
                  // 開: showBackCover=true → rotateY(0°)
                  // 閉: isCoverClosing=true → rotateY(-90°) に戻る（逆再生）
                  transform: (showBackCover && !isCoverClosing) ? 'rotateY(0deg)' : 'rotateY(-90deg)',
                  opacity: (showBackCover && !isCoverClosing) ? 1 : 0,
                  // 常に同じ transition を保持（React の同一レンダリング問題を回避）
                  transition: 'transform 600ms ease-in-out, opacity 600ms ease-in-out',
                }} />

                {/* Layer 3: 表紙前面（左辺ヒンジ、0°→-90° で開いて停止） */}
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: 10,
                  backgroundColor: 'var(--passport-navy)',
                  transformOrigin: '0% 50%',
                  backfaceVisibility: 'hidden',
                  willChange: 'transform',
                  transform: frontCoverOpen ? 'rotateY(-90deg)' : 'rotateY(0deg)',
                  transition: frontCoverOpen ? 'transform 600ms 150ms ease-in' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  boxShadow: '4px 0 32px rgba(0,0,0,0.45)',
                }}>
                  <svg width={60} height={60} viewBox="0 0 100 100" fill="none" aria-hidden>
                    <path fill="var(--passport-gold)" d="M72.51,83.3c-1.07,0-2.07-.42-2.83-1.17l-14.29-14.29c-.57-.57-.74-1.43-.43-2.18.31-.75,1.04-1.23,1.85-1.23h2.09c2.89,0,5.24-2.35,5.24-5.23v-.83c0-.81.49-1.54,1.23-1.85.75-.31,1.61-.14,2.18.43l13.65,13.65c.76.75,1.18,1.75,1.18,2.83,0,1.07-.42,2.08-1.18,2.83l-5.86,5.87c-.76.76-1.76,1.17-2.83,1.17ZM61.32,68.1l11.2,11.2,5.86-5.87s0,0,.01,0h0s-10.88-10.87-10.88-10.87c-1.06,2.7-3.36,4.78-6.19,5.55Z"/>
                    <path fill="var(--passport-gold)" d="M42.89,54.22h0c-.53,0-1.04-.21-1.41-.59l-5.06-5.06c-2.73-2.73-2.73-7.17,0-9.9l1.34-1.34c2.73-2.73,7.17-2.73,9.9,0l5.06,5.06c.78.78.78,2.05,0,2.83l-8.41,8.41c-.38.38-.88.59-1.41.59ZM42.71,39.29c-.77,0-1.54.29-2.12.88l-1.34,1.34c-1.17,1.17-1.17,3.07,0,4.24l3.64,3.64,5.58-5.58-3.64-3.64c-.58-.58-1.35-.88-2.12-.88Z"/>
                    <path fill="var(--passport-gold)" d="M46.64,84.12h-17.71c-6.24,0-11.31-5.07-11.31-11.3v-35.75c0-11.69,9.51-21.2,21.21-21.2h25.14c6.93,0,12.57,5.64,12.57,12.57l-.07,15.16c0,6.54-3.01,10.59-8.33,11.38v4.21c0,5.09-4.15,9.23-9.24,9.23h-2.19v5.64c0,5.55-4.52,10.06-10.07,10.06ZM38.83,19.88c-9.49,0-17.21,7.72-17.21,17.2v35.75c0,4.02,3.28,7.3,7.31,7.3h17.71c3.35,0,6.07-2.72,6.07-6.06v-7.04c0-1.43,1.17-2.6,2.6-2.6h3.59c2.89,0,5.24-2.35,5.24-5.23v-6.07c0-1.1.9-2,2-2,2.72,0,6.33-.78,6.33-7.53l.07-15.16c0-4.72-3.84-8.56-8.57-8.56h-25.14Z"/>
                  </svg>
                  <p style={{ color: 'var(--passport-gold)', fontSize: 13, fontWeight: 700, letterSpacing: '0.28em', margin: 0 }}>
                    RAKKAN
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: '0.15em', margin: 0 }}>
                    著作権証明
                  </p>
                </div>
              </>
            )}

          </div>
          </div>{/* Y シフトラッパー */}
          </div>
        </div>

        {/* ボタン: 常にスペース確保して showButtons 前後でレイアウトシフトを防ぐ */}
        <div
          className={showButtons ? 'anim-buttons-in flex items-center gap-3' : 'flex items-center gap-3 opacity-0 pointer-events-none'}
          aria-hidden={!showButtons}
        >
            <button
              type="button" onClick={handleDownload}
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-on-primary transition duration-fast hover:brightness-110 active:scale-95"
              style={{ backgroundColor: 'var(--passport-navy)' }}
            >
              <DownloadSimple size={18} weight="bold" />
              カードを保存
            </button>
            <button
              type="button" onClick={onClose}
              className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-5 py-3 text-sm font-medium text-on-surface-variant transition duration-fast hover:bg-surface-container"
            >
              <X size={16} weight="bold" />
              閉じる
            </button>
          </div>
      </div>

      {/* キャプチャ用 div は body 直下に Portal で描画（モーダル z-index 400 より低い 0 で完全に隠れる） */}
      {createPortal(
        <div
          ref={certCaptureRef}
          style={{
            position: 'fixed', top: 0, left: 0,
            width: H, height: W,
            overflow: 'hidden',
            backgroundColor: 'var(--passport-cream)',
            fontFamily: 'var(--font-sans)',
            pointerEvents: 'none',
            // clip-path で視覚的に非表示（キャプチャ時は style オプションで解除）
            clipPath: 'inset(0 0 0 100%)',
          }}
          aria-hidden
        >
          <CertificateContent
            preview={preview}
            profile={profile}
            stampId={stampId}
            stampDate={stampDate}
            showStamp
          />
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── 証明書コンテンツ（H×W の landscape 空間で描画） ───────────────────────

type CertProps = {
  preview: string
  profile: CreatorProfile
  stampId: string
  stampDate: string
  showStamp: boolean
}

function CertificateContent({ preview, profile, stampId, stampDate, showStamp }: CertProps) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* 上部バー */}
      <div style={{
        backgroundColor: 'var(--passport-navy)',
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width={14} height={14} viewBox="0 0 100 100" fill="none" aria-hidden>
            <path fill="var(--logo-seal)" d="M72.51,83.3c-1.07,0-2.07-.42-2.83-1.17l-14.29-14.29c-.57-.57-.74-1.43-.43-2.18.31-.75,1.04-1.23,1.85-1.23h2.09c2.89,0,5.24-2.35,5.24-5.23v-.83c0-.81.49-1.54,1.23-1.85.75-.31,1.61-.14,2.18.43l13.65,13.65c.76.75,1.18,1.75,1.18,2.83,0,1.07-.42,2.08-1.18,2.83l-5.86,5.87c-.76.76-1.76,1.17-2.83,1.17ZM61.32,68.1l11.2,11.2,5.86-5.87s0,0,.01,0h0s-10.88-10.87-10.88-10.87c-1.06,2.7-3.36,4.78-6.19,5.55Z"/>
            <path fill="var(--logo-seal)" d="M42.89,54.22h0c-.53,0-1.04-.21-1.41-.59l-5.06-5.06c-2.73-2.73-2.73-7.17,0-9.9l1.34-1.34c2.73-2.73,7.17-2.73,9.9,0l5.06,5.06c.78.78.78,2.05,0,2.83l-8.41,8.41c-.38.38-.88.59-1.41.59ZM42.71,39.29c-.77,0-1.54.29-2.12.88l-1.34,1.34c-1.17,1.17-1.17,3.07,0,4.24l3.64,3.64,5.58-5.58-3.64-3.64c-.58-.58-1.35-.88-2.12-.88Z"/>
            <path fill="var(--logo-seal)" d="M46.64,84.12h-17.71c-6.24,0-11.31-5.07-11.31-11.3v-35.75c0-11.69,9.51-21.2,21.21-21.2h25.14c6.93,0,12.57,5.64,12.57,12.57l-.07,15.16c0,6.54-3.01,10.59-8.33,11.38v4.21c0,5.09-4.15,9.23-9.24,9.23h-2.19v5.64c0,5.55-4.52,10.06-10.07,10.06ZM38.83,19.88c-9.49,0-17.21,7.72-17.21,17.2v35.75c0,4.02,3.28,7.3,7.31,7.3h17.71c3.35,0,6.07-2.72,6.07-6.06v-7.04c0-1.43,1.17-2.6,2.6-2.6h3.59c2.89,0,5.24-2.35,5.24-5.23v-6.07c0-1.1.9-2,2-2,2.72,0,6.33-.78,6.33-7.53l.07-15.16c0-4.72-3.84-8.56-8.57-8.56h-25.14Z"/>
          </svg>
          <span style={{ color: 'var(--passport-gold)', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em' }}>
            Rakkan
          </span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.08em' }}>
          著作権証明 / COPYRIGHT CREDENTIALS
        </span>
      </div>

      {/* メインコンテンツ */}
      <div style={{ flex: 1, display: 'flex', gap: 0, padding: '24px 16px 10px', position: 'relative', overflow: 'hidden' }}>

        {/* サムネイル */}
        <div style={{ flexShrink: 0, marginRight: 16 }}>
          <img
            src={preview} alt=""
            style={{
              width: 90, height: 112, objectFit: 'cover',
              borderRadius: 4, border: '1.5px solid #c8bfa0', display: 'block',
            }}
          />
        </div>

        {/* 著作者情報 */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#1a1520', lineHeight: 1.3 }}>
            {profile.name}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 10, color: '#7a6f88', lineHeight: 1.3 }}>
            {profile.copyright}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 9, color: '#7a6f88', wordBreak: 'break-all', lineHeight: 1.3, minHeight: '1em' }}>
            {profile.website ?? ''}
          </p>
          {profile.usageTerms && (
            <span style={{
              fontSize: 8, color: '#9a8fa8', padding: '2px 6px',
              backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4,
              display: 'inline-block', marginBottom: 10,
            }}>
              {profile.usageTerms}
            </span>
          )}

          {showStamp && (
            <div className="anim-stamp" style={{ position: 'absolute', right: 0, bottom: 60, width: 82, height: 82 }}>
              <StampSvg date={stampDate} size={82} />
            </div>
          )}
        </div>
      </div>

      {/* フッター: STAMP ID */}
      <div style={{ borderTop: '1px solid #e8e0d0', padding: '5px 16px', flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 7, letterSpacing: '0.12em', color: '#9a8fa8', fontWeight: 700, lineHeight: 1 }}>
          STAMP ID
        </span>
        <span style={{ fontSize: 8, color: '#6a6078', fontFamily: 'ui-monospace, monospace' }}>
          {stampId}
        </span>
      </div>
    </div>
  )
}

// ─── 円形ハンコ SVG ───────────────────────────────────────────────────────

function StampSvg({ date, size }: { date: string; size: number }) {
  const parts = date.split('  ')
  const c = size / 2, r = size / 2 - 4
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
      <circle cx={c} cy={c} r={r}     stroke="var(--passport-stamp)" strokeWidth="2.5" opacity="0.85" />
      <circle cx={c} cy={c} r={r - 7} stroke="var(--passport-stamp)" strokeWidth="1.2" opacity="0.85" />
      <text x={c} y={c - 5} textAnchor="middle"
        fill="var(--passport-stamp)" fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="bold" opacity="0.9">
        {parts[0] ?? ''}
      </text>
      <text x={c} y={c + 6} textAnchor="middle"
        fill="var(--passport-stamp)" fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="bold" opacity="0.9">
        {parts[1] ?? ''}
      </text>
      <text x={c} y={c + 18} textAnchor="middle"
        fill="var(--passport-stamp)" fontSize="7"
        fontFamily="'M PLUS Rounded 1c',system-ui" fontWeight="bold" letterSpacing="3" opacity="0.9">
        RAKKAN
      </text>
    </svg>
  )
}
