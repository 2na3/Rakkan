/** 著作者プロフィール（localStorageに保存） */
export type CreatorProfile = {
  id: string
  label: string          // プリセット名（例: "メイン", "SNS用"）
  name: string           // 著作者名
  copyright: string      // 著作権表示（例: "© 2025 山田花子"）
  email?: string         // メールアドレス（email か website のどちらか必須）
  website?: string       // ウェブサイトURL
  usageTerms?: string    // 利用条件
  description?: string   // 作品説明（任意）
  keywords?: string      // キーワード（カンマ区切り）
  createdAt: string
}

/** 1ファイルの処理状態 */
export type FileEntry = {
  id: string
  file: File
  preview: string         // ObjectURL
  status: 'idle' | 'checking' | 'rejected' | 'ready' | 'processing' | 'done' | 'error'
  aiDetection?: AiDetectionResult
  outputBlob?: Blob
  stampId?: string        // 処理時に生成される固有ID
  errorMessage?: string
}

/** AI生成検知の結果 */
export type AiDetectionResult = {
  isAiGenerated: boolean
  signals: AiSignal[]
}

export type AiSignal = {
  field: string    // 検出したフィールド名
  value: string    // 検出した値
  reason: string   // 人間向けの説明
}

/** XMPに埋め込むメタデータ */
export type EmbedMetadata = {
  profile: CreatorProfile
  dateCreated: string    // ISO 8601 (YYYY-MM-DD)
  stampId: string        // 固有スタンプID
  title?: string
}
