import { LockSimple } from '@phosphor-icons/react'

export function PrivacyNotice() {
  return (
    <aside
      aria-label="プライバシーについて"
      className="rounded-xl bg-surface-container p-4 flex gap-3"
    >
      <LockSimple size={20} weight="fill" className="text-on-surface-variant flex-shrink-0 mt-0.5" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold text-on-surface">画像データはあなたの端末内でのみ処理されます</p>
        <ul className="text-xs text-on-surface-variant list-none flex flex-col gap-0.5">
          <li>・画像はサーバーに送信されません</li>
          <li>・著作者情報はブラウザのローカルストレージに保存され、他の人には見えません</li>
          <li>・処理後の画像はそのままダウンロードされます</li>
        </ul>
      </div>
    </aside>
  )
}
