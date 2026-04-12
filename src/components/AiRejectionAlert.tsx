import { ProhibitInset } from '@phosphor-icons/react'
import type { FileEntry } from '../types'

type Props = {
  entries: FileEntry[]
  onRemove: (id: string) => void
}

export function AiRejectionAlert({ entries, onRemove }: Props) {
  const rejected = entries.filter((e) => e.status === 'rejected')
  if (rejected.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-xl border border-error-container bg-error-container p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-2">
        <ProhibitInset size={24} weight="fill" className="text-on-error-container flex-shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-sm font-bold text-on-error-container">
            AI生成画像を検出しました
          </p>
          <p className="text-xs text-on-error-container mt-0.5">
            Rakkan はクリエイターが自ら制作した作品を保護するためのツールです。
            AI生成画像へのメタデータ付与はサポートしていません。
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rejected.map((entry) => (
          <li key={entry.id} className="rounded-lg bg-surface-container-lowest p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-on-surface truncate">{entry.file.name}</p>
              <button
                type="button"
                onClick={() => onRemove(entry.id)}
                className="text-xs text-on-surface-variant hover:text-error flex-shrink-0"
              >
                削除
              </button>
            </div>
            {entry.aiDetection && entry.aiDetection.signals.length > 0 && (
              <ul className="flex flex-col gap-1">
                {entry.aiDetection.signals.map((signal, i) => (
                  <li key={i} className="text-xs text-on-surface-variant">
                    <span className="font-mono text-on-surface">{signal.field}</span>
                    {' — '}
                    {signal.reason}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
