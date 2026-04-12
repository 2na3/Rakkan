import { useState, useCallback } from 'react'
import { Seal } from '@phosphor-icons/react'
import { DropZone } from './components/DropZone'
import { ProfilePanel } from './components/ProfilePanel'
import { AiRejectionAlert } from './components/AiRejectionAlert'
import { PrivacyNotice } from './components/PrivacyNotice'
import { PassportModal } from './components/PassportModal'
import { useProfile } from './hooks/useProfile'
import { readMetadata } from './lib/metadata-reader'
import { buildXmpString, buildLicensingContactNote } from './lib/xmp-builder'
import { embedXmpToJpeg } from './lib/jpeg-writer'
import { embedXmpToPng } from './lib/png-writer'
import { generateStampId } from './lib/stamp-id'
import { embedLsbWatermark, type LsbPayload } from './lib/lsb-watermark'
import type { FileEntry, EmbedMetadata } from './types'

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

type ModalTarget = { entry: FileEntry }

export function App() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null)
  const profileState = useProfile()

  const readyCount = entries.filter((e) => e.status === 'ready').length
  const doneEntries = entries.filter((e) => e.status === 'done')

  const addFiles = useCallback(async (files: File[]) => {
    const newEntries: FileEntry[] = files.map((file) => ({
      id: generateId(),
      file,
      preview: URL.createObjectURL(file),
      status: 'checking',
    }))

    setEntries((prev) => [...prev, ...newEntries])

    await Promise.all(
      newEntries.map(async (entry) => {
        const { aiDetection } = await readMetadata(entry.file)
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? { ...e, status: aiDetection.isAiGenerated ? 'rejected' : 'ready', aiDetection }
              : e,
          ),
        )
      }),
    )
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id)
      if (entry?.preview) URL.revokeObjectURL(entry.preview)
      return prev.filter((e) => e.id !== id)
    })
  }, [])

  const handleProcess = useCallback(async () => {
    const { activeProfile } = profileState
    if (!activeProfile) return

    const targets = entries.filter((e) => e.status === 'ready')
    if (targets.length === 0) return

    setIsProcessing(true)

    await Promise.all(
      targets.map(async (entry) => {
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, status: 'processing' } : e)),
        )
        try {
          const arrayBuffer = await entry.file.arrayBuffer()
          const stampId = await generateStampId(arrayBuffer)

          const embedMeta: EmbedMetadata = {
            profile: activeProfile,
            dateCreated: new Date().toISOString().split('T')[0],
            stampId,
          }
          const xmpString = buildXmpString(embedMeta)

          let outputBuffer: ArrayBuffer
          if (entry.file.type === 'image/jpeg') {
            outputBuffer = embedXmpToJpeg(arrayBuffer, xmpString)
          } else if (entry.file.type === 'image/png') {
            outputBuffer = embedXmpToPng(arrayBuffer, xmpString)
            const contactNote = buildLicensingContactNote(activeProfile.email, activeProfile.website)
            const composedUsageTerms = [activeProfile.usageTerms, contactNote].filter(Boolean).join('\n')
            const lsbPayload: LsbPayload = {
              n: activeProfile.name,
              c: activeProfile.copyright,
              s: stampId,
              ...(composedUsageTerms && { u: composedUsageTerms }),
              ...(activeProfile.website && { w: activeProfile.website }),
              ...(activeProfile.email && { e: activeProfile.email }),
            }
            outputBuffer = await embedLsbWatermark(outputBuffer, lsbPayload)
          } else {
            throw new Error('Unsupported format')
          }

          const outputBlob = new Blob([outputBuffer], { type: entry.file.type })
          const doneEntry: FileEntry = { ...entry, status: 'done', outputBlob, stampId }

          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? doneEntry : e)),
          )

          // 最初の1枚はモーダルを自動表示
          if (targets.indexOf(entry) === 0) {
            setModalTarget({ entry: doneEntry })
          }
        } catch (err) {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id
                ? { ...e, status: 'error', errorMessage: String(err) }
                : e,
            ),
          )
        }
      }),
    )

    setIsProcessing(false)
  }, [entries, profileState])

  const downloadEntry = useCallback((entry: FileEntry) => {
    if (!entry.outputBlob) return
    const ext = entry.file.type === 'image/png' ? 'png' : 'jpg'
    const baseName = entry.file.name.replace(/\.[^.]+$/, '')
    const url = URL.createObjectURL(entry.outputBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}_rakkan.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const downloadAll = useCallback(() => {
    doneEntries.forEach(downloadEntry)
  }, [doneEntries, downloadEntry])

  const canProcess = readyCount > 0 && !!profileState.activeProfile && !isProcessing

  return (
    <div className="min-h-screen bg-surface">
      {/* ヘッダー */}
      <header className="sticky top-0 z-sticky bg-passport-navy px-4 py-3 flex items-center gap-3">
        <Seal size={28} weight="fill" style={{ color: 'var(--logo-seal)' }} aria-hidden />
        <div>
          <h1 className="text-base font-bold text-passport-gold leading-tight">Rakkan</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <PrivacyNotice />

        <ProfilePanel
          profiles={profileState.profiles}
          activeProfile={profileState.activeProfile}
          onSave={profileState.saveProfile}
          onUpdate={profileState.updateProfile}
          onDelete={profileState.deleteProfile}
          onSelect={profileState.selectProfile}
        />

        <section aria-labelledby="upload-heading">
          <h2 id="upload-heading" className="text-sm font-bold uppercase tracking-wide text-on-surface-variant mb-3">
            画像を選択
          </h2>
          <DropZone entries={entries} onFilesAdded={addFiles} onRemove={removeEntry} />
        </section>

        <AiRejectionAlert entries={entries} onRemove={removeEntry} />

        {readyCount > 0 && (
          <button
            type="button"
            onClick={handleProcess}
            disabled={!canProcess}
            className={[
              'w-full rounded-xl py-4 text-sm font-bold transition duration-normal ease-out',
              canProcess
                ? 'text-on-primary shadow-md hover:brightness-110 active:scale-95'
                : 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed',
            ].join(' ')}
            style={canProcess ? { backgroundColor: 'var(--passport-navy)' } : undefined}
          >
            {isProcessing ? '処理中…' : `${readyCount} 枚にメタデータを埋め込む`}
          </button>
        )}

        {/* 結果・ダウンロード */}
        {doneEntries.length > 0 && (
          <section aria-labelledby="result-heading" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="result-heading" className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">
                ダウンロード
              </h2>
              {doneEntries.length > 1 && (
                <button
                  type="button"
                  onClick={downloadAll}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  すべてダウンロード
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {doneEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg bg-success-container px-4 py-3"
                >
                  <img
                    src={entry.preview}
                    alt=""
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                  />
                  <p className="flex-1 min-w-0 text-sm font-medium text-on-success-container truncate">
                    {entry.file.name}
                  </p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setModalTarget({ entry })}
                      className="text-xs font-medium text-on-success-container bg-surface-container-lowest rounded-lg px-3 py-1.5 hover:bg-surface-container transition duration-fast"
                    >
                      証明書
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadEntry(entry)}
                      className="text-xs font-medium text-on-success-container bg-surface-container-lowest rounded-lg px-3 py-1.5 hover:bg-surface-container transition duration-fast"
                    >
                      保存
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="text-center text-xs text-on-surface-variant py-8 border-t border-outline-variant mt-4">
        © 2026 Shirota - All rights reserved
      </footer>

      {/* パスポートモーダル */}
      {modalTarget && profileState.activeProfile && (
        <PassportModal
          preview={modalTarget.entry.preview}
          fileName={modalTarget.entry.file.name}
          profile={profileState.activeProfile}
          stampId={modalTarget.entry.stampId ?? ''}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  )
}
