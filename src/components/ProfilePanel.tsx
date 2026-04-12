import { useState, useEffect } from 'react'
import type { CreatorProfile } from '../types'

type ProfileDraft = Omit<CreatorProfile, 'id' | 'createdAt'>

type Props = {
  profiles: CreatorProfile[]
  activeProfile: CreatorProfile | null
  onSave: (draft: ProfileDraft) => void
  onUpdate: (id: string, patch: Partial<ProfileDraft>) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
}

const DEFAULT_USAGE_TERMS =
  '著作権者の許可なく転載・複製・改変・二次利用を禁止します。利用希望の場合は事前にご連絡ください。'

const DEFAULT_DRAFT: ProfileDraft = {
  label: '',
  name: '',
  copyright: '',
  email: '',
  website: '',
  usageTerms: DEFAULT_USAGE_TERMS,
  description: '',
  keywords: '',
}

export function ProfilePanel({ profiles, activeProfile, onSave, onUpdate, onDelete, onSelect }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft>(DEFAULT_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)

  // activeProfile が変わったら下書きに反映
  useEffect(() => {
    if (activeProfile && !isEditing) {
      setDraft({
        label: activeProfile.label,
        name: activeProfile.name,
        copyright: activeProfile.copyright,
        email: activeProfile.email ?? '',
        website: activeProfile.website ?? '',
        usageTerms: activeProfile.usageTerms ?? DEFAULT_USAGE_TERMS,
        description: activeProfile.description ?? '',
        keywords: activeProfile.keywords ?? '',
      })
    }
  }, [activeProfile, isEditing])

  const handleNew = () => {
    setDraft(DEFAULT_DRAFT)
    setEditingId(null)
    setIsEditing(true)
  }

  const handleEdit = (profile: CreatorProfile) => {
    setDraft({
      label: profile.label,
      name: profile.name,
      copyright: profile.copyright,
      email: profile.email ?? '',
      website: profile.website ?? '',
      usageTerms: profile.usageTerms ?? DEFAULT_USAGE_TERMS,
      description: profile.description ?? '',
      keywords: profile.keywords ?? '',
    })
    setEditingId(profile.id)
    setIsEditing(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) {
      onUpdate(editingId, draft)
    } else {
      onSave(draft)
    }
    setIsEditing(false)
    setEditingId(null)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditingId(null)
  }

  const isContactValid = !!(draft.email || draft.website)

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="profile-heading" className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">
          著作者情報
        </h2>
        {!isEditing && (
          <button
            type="button"
            onClick={handleNew}
            className="text-xs font-medium text-primary hover:underline"
          >
            ＋ 新規プリセット
          </button>
        )}
      </div>

      {/* プリセット一覧 */}
      {!isEditing && profiles.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="プロフィールプリセット">
          {profiles.map((p) => (
            <li
              key={p.id}
              className={[
                'flex items-center gap-3 rounded-lg px-4 py-3 border transition-colors duration-fast ease-out cursor-pointer',
                p.id === activeProfile?.id
                  ? 'border-primary bg-surface-container-low'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low',
              ].join(' ')}
              onClick={() => onSelect(p.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{p.label || p.name}</p>
                <p className="text-xs text-on-surface-variant truncate">{p.name}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleEdit(p) }}
                  className="text-xs text-on-surface-variant hover:text-primary transition-colors duration-fast"
                  aria-label={`${p.label} を編集`}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(p.id) }}
                  className="text-xs text-on-surface-variant hover:text-error transition-colors duration-fast"
                  aria-label={`${p.label} を削除`}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 新規 or 編集フォーム */}
      {isEditing && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-4">
          <Field
            label="プリセット名"
            id="label"
            value={draft.label}
            onChange={(v) => setDraft((d) => ({ ...d, label: v }))}
            placeholder="例: メイン、SNS用"
            required
          />
          <Field
            label="著作者名"
            id="name"
            value={draft.name}
            onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="例: 著作 権守"
            required
          />
          <Field
            label="著作権表示"
            id="copyright"
            value={draft.copyright}
            onChange={(v) => setDraft((d) => ({ ...d, copyright: v }))}
            placeholder="例: © 2026 著作 権守"
            required
          />
          <TextareaField
            label="利用条件"
            id="usageTerms"
            value={draft.usageTerms ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, usageTerms: v }))}
            placeholder={DEFAULT_USAGE_TERMS}
            required
            hint="利用条件を明示することで、著作権者への連絡なしに利用できる「未管理著作物裁定制度」の対象になるリスクを回避できます。"
          />

          {/* 連絡先（どちらか一方必須） */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              連絡先 <span className="text-error font-normal normal-case tracking-normal">（メール or URL のどちらか必須）</span>
            </p>
            <div className="flex flex-col gap-3">
              <Field
                label="メールアドレス"
                id="email"
                type="email"
                value={draft.email ?? ''}
                onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
                placeholder="example@email.com"
                hint="画像ファイル内にのみ記録されます"
              />
              <Field
                label="ウェブサイト URL"
                id="website"
                type="url"
                value={draft.website ?? ''}
                onChange={(v) => setDraft((d) => ({ ...d, website: v }))}
                placeholder="https://example.com"
                hint="pixiv の数値IDのURLなど、変わりにくいURLを推奨します"
              />
            </div>
            {!isContactValid && (
              <p className="text-xs text-error mt-1" role="alert">
                メールアドレスまたは URL を入力してください
              </p>
            )}
          </div>

          <Field
            label="キーワード（カンマ区切り）"
            id="keywords"
            value={draft.keywords ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, keywords: v }))}
            placeholder="例: イラスト, キャラクター, オリジナル"
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!draft.name || !draft.copyright || !draft.usageTerms || !isContactValid}
              className="flex-1 rounded-lg bg-primary text-on-primary text-sm font-medium py-2.5 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition duration-fast ease-out"
            >
              {editingId ? '更新する' : '保存する'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 rounded-lg border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container transition duration-fast"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      {!isEditing && profiles.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-outline-variant p-6 text-center">
          <p className="text-sm text-on-surface-variant">プリセットがありません</p>
          <button
            type="button"
            onClick={handleNew}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            最初のプロフィールを作成する
          </button>
        </div>
      )}
    </section>
  )
}

type FieldProps = {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: 'text' | 'email' | 'url'
  hint?: string
}

function Field({ label, id, value, onChange, placeholder, required, type = 'text', hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
        {required && <span className="text-error ml-1" aria-hidden>*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-outline transition-colors duration-fast focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
    </div>
  )
}

type TextareaFieldProps = {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  hint?: string
}

function TextareaField({ label, id, value, onChange, placeholder, required, hint }: TextareaFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
        {required && <span className="text-error ml-1" aria-hidden>*</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={3}
        className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-outline transition-colors duration-fast focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
      />
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
    </div>
  )
}
