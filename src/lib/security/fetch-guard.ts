/**
 * セキュリティ強化フェッチガード
 * SSRF対策とセキュアなHTMLフェッチ機能
 */

// 最大本文サイズ（5MB）
const MAX_CONTENT_SIZE = 5 * 1024 * 1024
// 最大リダイレクト回数
const MAX_REDIRECTS = 5

/**
 * SSRF対策のURL検証
 */
export async function validateUrlForFetch(url: string): Promise<void> {
  const urlObj = new URL(url)

  // 1. プロトコル制限（http/https のみ許可）
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error(`Unsupported protocol: ${urlObj.protocol}`)
  }

  // 2. プライベートIP帯・localhost ブロック
  const hostname = urlObj.hostname.toLowerCase()

  // localhost 系
  if (
    ['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    hostname.startsWith('127.') ||
    hostname.endsWith('.localhost')
  ) {
    throw new Error('Localhost access denied')
  }

  // プライベートIP帯チェック
  if (isPrivateIP(hostname)) {
    throw new Error('Private IP access denied')
  }

  // 3. 危険なポート番号チェック
  const dangerousPorts = [
    22, 23, 25, 53, 135, 139, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 6379,
    27017,
  ]
  const port =
    parseInt(urlObj.port, 10) || (urlObj.protocol === 'https:' ? 443 : 80)

  if (dangerousPorts.includes(port)) {
    throw new Error(`Dangerous port access denied: ${port}`)
  }
}

/**
 * プライベートIP範囲チェック
 */
function isPrivateIP(hostname: string): boolean {
  // IPv4プライベートIP帯の正規表現
  const privateIPv4Patterns = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // リンクローカル 169.254.0.0/16
    /^0\./, // 0.0.0.0/8
  ]

  return privateIPv4Patterns.some((pattern) => pattern.test(hostname))
}

/**
 * セキュアなHTMLフェッチ
 */
export async function safeFetch(url: string): Promise<string> {
  let currentUrl = url
  let redirectCount = 0

  while (redirectCount <= MAX_REDIRECTS) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Encore/1.0; +https://encore.example.com)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8', // 日本語サイト対応
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
      },
      redirect: 'manual', // 手動でリダイレクト制御
      signal: AbortSignal.timeout(10000),
    })

    // リダイレクト処理
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error('Redirect without location header')
      }

      // リダイレクト先URLの検証
      const redirectUrl = new URL(location, currentUrl).href
      await validateUrlForFetch(redirectUrl)

      currentUrl = redirectUrl
      redirectCount++
      continue
    }

    // HTTPステータスチェック
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Content-Type チェック（text/html のみ許可）
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      throw new Error(
        `Invalid content type: ${contentType}. Only text/html is allowed.`,
      )
    }

    // Content-Length チェック
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_SIZE) {
      throw new Error(
        `Content too large: ${contentLength} bytes (max: ${MAX_CONTENT_SIZE})`,
      )
    }

    // エンコーディング検出とストリーミング取得
    const encoding = detectEncoding(response.headers.get('content-type'))
    const html = await fetchAndDecode(response, encoding)

    return html
  }

  throw new Error(`Too many redirects: ${redirectCount}`)
}

/**
 * エンコーディング検出
 */
function detectEncoding(contentType: string | null): string {
  if (!contentType) return 'utf-8'

  // Content-Typeからcharsetを抽出
  const charsetMatch = contentType.match(/charset=([^;]+)/i)
  if (charsetMatch) {
    const charset = charsetMatch[1].trim().toLowerCase()

    // 日本語エンコーディングの正規化
    const encodingMap: { [key: string]: string } = {
      shift_jis: 'shift_jis',
      'shift-jis': 'shift_jis',
      sjis: 'shift_jis',
      'x-sjis': 'shift_jis',
      'euc-jp': 'euc-jp',
      eucjp: 'euc-jp',
      'iso-2022-jp': 'iso-2022-jp',
      'utf-8': 'utf-8',
      utf8: 'utf-8',
    }

    return encodingMap[charset] || 'utf-8'
  }

  return 'utf-8'
}

/**
 * ストリーミング取得とデコード
 */
async function fetchAndDecode(
  response: Response,
  encoding: string,
): Promise<string> {
  const body = response.body
  if (!body) {
    throw new Error('No response body')
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalSize = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalSize += value.length
      if (totalSize > MAX_CONTENT_SIZE) {
        throw new Error(
          `Content too large during streaming: ${totalSize} bytes`,
        )
      }

      chunks.push(value)
    }

    // 全データをBufferに結合
    const buffer = Buffer.concat(chunks)

    // エンコーディングに応じてデコード
    let html: string
    if (encoding === 'utf-8') {
      // UTF-8の場合はTextDecoderを使用（高速）
      html = new TextDecoder('utf-8').decode(buffer)
    } else {
      // 他のエンコーディングの場合は動的import（Node.jsでのみ使用）
      try {
        const iconv = await import('iconv-lite')
        if (!iconv.encodingExists(encoding)) {
          console.warn(
            `Unsupported encoding: ${encoding}, falling back to utf-8`,
          )
          html = new TextDecoder('utf-8').decode(buffer)
        } else {
          html = iconv.decode(buffer, encoding)
        }
      } catch (error) {
        console.warn('iconv-lite not available, using UTF-8:', error)
        html = new TextDecoder('utf-8').decode(buffer)
      }
    }

    // HTMLからメタタグのcharsetもチェック
    const detectedEncoding = detectEncodingFromMeta(html)
    if (
      detectedEncoding &&
      detectedEncoding !== encoding &&
      isLikelyGarbled(html)
    ) {
      try {
        const iconv = await import('iconv-lite')
        html = iconv.decode(buffer, detectedEncoding)
        console.info(`Re-decoded with detected encoding: ${detectedEncoding}`)
      } catch (error) {
        console.warn('Re-decoding failed, keeping original:', error)
      }
    }

    return html
  } finally {
    reader.releaseLock()
  }
}

/**
 * HTMLメタタグからのエンコーディング検出
 */
function detectEncodingFromMeta(html: string): string | null {
  const metaCharsetMatch = html.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)
  if (metaCharsetMatch) {
    const charset = metaCharsetMatch[1].toLowerCase()

    const encodingMap: { [key: string]: string } = {
      shift_jis: 'shift_jis',
      'shift-jis': 'shift_jis',
      sjis: 'shift_jis',
      'euc-jp': 'euc-jp',
      'iso-2022-jp': 'iso-2022-jp',
      'utf-8': 'utf-8',
    }

    return encodingMap[charset] || null
  }

  return null
}

/**
 * 文字化けパターン検出
 */
function isLikelyGarbled(html: string): boolean {
  // 日本語文字化けの典型的パターンを検出
  const garbledPatterns = [
    /[\u00C0-\u00FF]{3,}/, // 連続する拡張ASCII文字（Shift_JIS→UTF-8誤変換）
    /\ufffd{2,}/, // 連続する置換文字（？マーク）
    /縺[縺-繧繝]/, // Shift_JIS→UTF-8文字化けの典型パターン
  ]

  return garbledPatterns.some((pattern) => pattern.test(html))
}

/**
 * Unicode安全なテキスト切り詰め
 */
export function safeTextTrim(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text
  }

  // Intl.Segmenterが利用可能かチェック（Node.js 16+、最新ブラウザ）
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      // 日本語対応の文字素単位でセグメント化
      const segmenter = new (Intl as any).Segmenter('ja', {
        granularity: 'grapheme',
      })
      const segments = [...segmenter.segment(text)]

      if (segments.length <= maxLength) {
        return text
      }

      // maxLength文字素まで取得
      const trimmedSegments = segments.slice(0, maxLength)
      const trimmedText = trimmedSegments.map((s: any) => s.segment).join('')

      // 語尾が綺麗になるよう調整
      return trimmedText + (segments.length > maxLength ? '...' : '')
    } catch (error) {
      console.warn('Intl.Segmenter failed, falling back to simple trim:', error)
    }
  }

  // フォールバック: 従来の方法（結合文字で少し安全に）
  return safeSubstring(text, maxLength) + (text.length > maxLength ? '...' : '')
}

/**
 * サロゲートペア対応の安全な文字列切り詰め
 */
function safeSubstring(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  // サロゲートペアを考慮した切り詰め
  let result = ''
  let count = 0

  for (let i = 0; i < text.length && count < maxLength; i++) {
    const char = text[i]

    // サロゲートペア（高サロゲート）をチェック
    if (char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdbff) {
      // 次の文字が低サロゲートかチェック
      if (i + 1 < text.length) {
        const nextChar = text[i + 1]
        if (
          nextChar.charCodeAt(0) >= 0xdc00 &&
          nextChar.charCodeAt(0) <= 0xdfff
        ) {
          // サロゲートペアとして扱う
          if (count < maxLength) {
            result += char + nextChar
            i++ // 次の文字をスキップ
            count++
          }
          continue
        }
      }
    }

    result += char
    count++
  }

  return result
}
