import { useRef, useState, useCallback } from 'react'
import { Image } from '@phosphor-icons/react'
import type { FileEntry } from '../types'

type Props = {
  onFilesAdded: (files: File[]) => void
  entries: FileEntry[]
  onRemove: (id: string) => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png']
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png'

export function DropZone({ onFilesAdded, entries, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const valid = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (valid.length > 0) onFilesAdded(valid)
    },
    [onFilesAdded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ドロップエリア */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          'w-full rounded-xl border-2 border-dashed transition-colors duration-fast ease-out',
          'flex flex-col items-center justify-center gap-3 py-10 px-6',
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isDragging
            ? 'border-primary bg-surface-container-low'
            : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-surface-container-low',
        ].join(' ')}
        aria-label="画像ファイルを選択またはドロップ"
      >
        <Image size={36} weight="thin" className="text-outline" aria-hidden />
        <div className="text-center">
          <p className="text-on-surface font-medium text-sm">
            画像をドロップ、またはタップして選択
          </p>
          <p className="text-on-surface-variant text-xs mt-1">
            JPEG・PNG に対応 / 複数ファイル可
          </p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        aria-hidden
      />

      {/* ファイルリスト */}
      {entries.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="選択済みファイル">
          {entries.map((entry) => (
            <FileRow key={entry.id} entry={entry} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileRow({ entry, onRemove }: { entry: FileEntry; onRemove: (id: string) => void }) {
  const statusInfo = getStatusInfo(entry)

  return (
    <li className="flex items-center gap-3 rounded-lg bg-surface-container-low px-4 py-3">
      {/* サムネイル */}
      <img
        src={entry.preview}
        alt=""
        className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-surface-container"
      />

      {/* ファイル名・サイズ */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-on-surface truncate">{entry.file.name}</p>
        <p className="text-xs text-on-surface-variant">
          {(entry.file.size / 1024).toFixed(0)} KB
        </p>
      </div>

      {/* ステータス */}
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusInfo.className}`}
      >
        {statusInfo.label}
      </span>

      {/* 削除ボタン */}
      {(entry.status === 'idle' || entry.status === 'ready' || entry.status === 'rejected' || entry.status === 'error') && (
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          className="flex-shrink-0 text-on-surface-variant hover:text-error transition-colors duration-fast ease-out p-1 rounded-md"
          aria-label={`${entry.file.name} を削除`}
        >
          ✕
        </button>
      )}
    </li>
  )
}

function getStatusInfo(entry: FileEntry): { label: string; className: string } {
  switch (entry.status) {
    case 'idle':
    case 'checking':
      return { label: '確認中…', className: 'bg-surface-container text-on-surface-variant' }
    case 'rejected':
      return { label: 'AI生成を検出', className: 'bg-error-container text-on-error-container' }
    case 'ready':
      return { label: '準備完了', className: 'bg-success-container text-on-success-container' }
    case 'processing':
      return { label: '処理中…', className: 'bg-surface-container text-on-surface-variant' }
    case 'done':
      return { label: '完了', className: 'bg-success-container text-on-success-container' }
    case 'error':
      return { label: 'エラー', className: 'bg-error-container text-on-error-container' }
  }
}
