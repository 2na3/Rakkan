import type { EmbedMetadata } from '../types'

/**
 * 利用許諾問い合わせ先の案内文を生成する（XMP・LSB 共用）
 * 連絡先が未設定の場合は空文字を返す
 */
export function buildLicensingContactNote(email?: string, website?: string): string {
  const contacts = [email, website].filter(Boolean)
  if (contacts.length === 0) return ''
  return `利用許諾に関するお問い合わせは ${contacts.join(' または ')} までご連絡ください。`
}

/**
 * XMP XML文字列を生成する
 * IPTC Core / XMP Rights / Dublin Core の主要フィールドを含む
 *
 * 連絡先が設定されている場合、dc:description と xmpRights:UsageTerms の両方に
 * 「利用許諾に関するお問い合わせは〇〇まで」を自動付加する。
 * profile.usageTerms / profile.description の保存値は変更しない。
 */
export function buildXmpString(meta: EmbedMetadata): string {
  const { profile, dateCreated, stampId, title } = meta
  const keywords = profile.keywords
    ? profile.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : []

  // 利用許諾問い合わせ先の案内文（連絡先がある場合のみ生成）
  const contactNote = buildLicensingContactNote(profile.email, profile.website)

  const contactInfoXml = buildContactInfo(profile.email, profile.website)
  const keywordsXml =
    keywords.length > 0
      ? `<dc:subject><rdf:Bag>${keywords.map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>`
      : ''
  const titleXml = title
    ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>`
    : ''

  // dc:description: 作品説明 + 利用許諾案内文
  const fullDescription = [profile.description, contactNote].filter(Boolean).join('')
  const descriptionXml = fullDescription
    ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(fullDescription)}</rdf:li></rdf:Alt></dc:description>`
    : ''

  // xmpRights:UsageTerms: 利用条件 + 利用許諾案内文
  const fullUsageTerms = [profile.usageTerms, contactNote].filter(Boolean).join('')
  const usageTermsXml = fullUsageTerms
    ? `<xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(fullUsageTerms)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>`
    : ''

  const webStatementXml = profile.website
    ? `<xmpRights:WebStatement>${escapeXml(profile.website)}</xmpRights:WebStatement>`
    : ''

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
      xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"
      xmlns:rakkan="https://rakkan.app/ns/1.0/">
      <dc:creator><rdf:Seq><rdf:li>${escapeXml(profile.name)}</rdf:li></rdf:Seq></dc:creator>
      <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(profile.copyright)}</rdf:li></rdf:Alt></dc:rights>
      ${titleXml}
      ${descriptionXml}
      ${keywordsXml}
      <xmp:CreateDate>${escapeXml(dateCreated)}</xmp:CreateDate>
      ${usageTermsXml}
      ${webStatementXml}
      ${contactInfoXml}
      <rakkan:StampId>${escapeXml(stampId)}</rakkan:StampId>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

function buildContactInfo(email?: string, website?: string): string {
  const fields: string[] = []
  if (email) fields.push(`<Iptc4xmpCore:CiEmailWork>${escapeXml(email)}</Iptc4xmpCore:CiEmailWork>`)
  if (website) fields.push(`<Iptc4xmpCore:CiUrlWork>${escapeXml(website)}</Iptc4xmpCore:CiUrlWork>`)
  if (fields.length === 0) return ''
  return `<Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource">${fields.join('')}</Iptc4xmpCore:CreatorContactInfo>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
