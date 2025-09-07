# Encore - メタデータ抽出システム

## フォルダ構成

```
src/
├── app/
│   ├── api/
│   │   ├── preview/
│   │   │   ├── route.ts          -- メインメタデータ抽出（Node）
│   │   │   ├── normalize/
│   │   │   │   └── route.ts      -- URL正規化（Edge）
│   │   │   ├── cache-check/
│   │   │   │   └── route.ts      -- キャッシュチェック（Node）
│   │   │   └── external/
│   │   │       └── route.ts      -- 外部APIフォールバック（Node）
│   │   ├── cron/
│   │   │   └── revalidate/
│   │   │       └── route.ts      -- バックグラウンド再取得
├── lib/
│   └── services/
│       └── metadata/
│           ├── preview-extractor.ts  -- メインメタデータ抽出
│           ├── external-api.ts       -- 外部APIフォールバック
│           ├── site-handlers.ts      -- 特定サイト専用パーサー
│           ├── cache-manager.ts      -- キャッシュ管理
│           └── index.ts              -- 統合サービス
```

## メタデータ抽出システム設計（現実解）

### 実装方針（Vercel対応）
- **Edge**: 認可チェック、軽量リダイレクト、キャッシュ判定など"薄い"処理のみ
- **Node**: URL取得→HTML取得→OGP/メタ抽出→本文抜粋の実質的処理
- **HTMLRewriter**: Vercelで使用不可のため、Cheerioで代替

### APIルート構成

#### メインメタデータ抽出（Node）
```typescript
// app/api/preview/route.ts - メイン抽出処理（Node.js Runtime）
export const runtime = 'nodejs'

import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { validateUrlForFetch, safeFetch } from '@/lib/security/fetch-guard'

export async function POST(request: Request) {
  const { url } = await request.json()
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    // SSRF対策: URL検証
    await validateUrlForFetch(url)
    
    // セキュアなfetch処理
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    
    // OGP/メタデータ抽出（優先度順）
    const title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      ''
    
    const description = 
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      ''
    
    const image = 
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="apple-touch-icon"]').attr('href') ||
      ''
    
    const siteName = 
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="application-name"]').attr('content') ||
      ''
    
    const favicon = 
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      '/favicon.ico'
    
    // 相対URLを絶対URLに変換
    const absoluteImage = image ? new URL(image, url).href : ''
    const absoluteFavicon = favicon ? new URL(favicon, url).href : ''
    
    // descriptionが無い場合はReadabilityで本文抜粋
    let extractedDescription = description
    if (!extractedDescription && html) {
      try {
        const dom = new JSDOM(html, { url })
        const reader = new Readability(dom.window.document)
        const article = reader.parse()
        
        if (article?.textContent) {
          // 日本語対応: 全角160-200文字程度に制限
          extractedDescription = article.textContent
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200) + (article.textContent.length > 200 ? '...' : '')
        }
      } catch (readabilityError) {
        console.warn('Readability extraction failed:', readabilityError)
      }
    }
    
    const metadata = {
      title,
      description: extractedDescription,
      image: absoluteImage,
      favicon: absoluteFavicon,
      siteName,
      url
    }
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'node'
    })
    
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'node' 
    }, { status: 500 })
  }
}
```

#### Edge軽量処理（URL正規化・認証チェック）
```typescript
// app/api/preview/normalize/route.ts - Edge軽量処理（URL正規化のみ）
export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    // URL正規化のみ（軽量処理）
    const normalizedUrl = normalizeUrl(url)
    
    // 基本的なURL検証
    validateBasicUrl(normalizedUrl)
    
    return Response.json({
      success: true,
      originalUrl: url,
      normalizedUrl,
      source: 'edge'
    })
    
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'edge' 
    }, { status: 400 })
  }
}

function validateBasicUrl(url: string): void {
  const urlObj = new URL(url)
  
  // プロトコル制限
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error(`Unsupported protocol: ${urlObj.protocol}`)
  }
}

function normalizeUrl(url: string): string {
  const urlObj = new URL(url)
  
  // ホスト名の小文字化
  urlObj.hostname = urlObj.hostname.toLowerCase()
  
  // デフォルトポート削除
  if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
      (urlObj.protocol === 'https:' && urlObj.port === '443')) {
    urlObj.port = ''
  }
  
  // フラグメント除去
  urlObj.hash = ''
  
  // トラッキングパラメータ除去
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid', 'ref', 'source'
  ]
  trackingParams.forEach(param => urlObj.searchParams.delete(param))
  
  // クエリキーのソート
  const sortedParams = new URLSearchParams()
  Array.from(urlObj.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => sortedParams.append(key, value))
  urlObj.search = sortedParams.toString()
  
  // 末尾スラッシュ統一
  let normalizedUrl = urlObj.toString()
  if (urlObj.pathname !== '/' && normalizedUrl.endsWith('/')) {
    normalizedUrl = normalizedUrl.slice(0, -1)
  }
  
  return normalizedUrl
}
```

#### Node キャッシュチェック API
```typescript
// app/api/preview/cache-check/route.ts - Node キャッシュチェック
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  const { normalizedUrl } = await request.json()
  
  if (!normalizedUrl) {
    return Response.json({ error: 'Normalized URL required' }, { status: 400 })
  }
  
  try {
    // 認証チェック（RLSで自動制御）
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // キャッシュチェック
    const { data: cached, error } = await supabase
      .from('link_previews')
      .select('*')
      .eq('url', normalizedUrl)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error
    }
    
    if (cached && !shouldRevalidate(cached)) {
      return Response.json({
        cached: true,
        data: cached,
        source: 'cache'
      })
    }
    
    // キャッシュが無い、または期限切れの場合
    return Response.json({
      cached: false,
      shouldFetch: true,
      normalizedUrl
    })
    
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'node' 
    }, { status: 500 })
  }
}

function shouldRevalidate(cached: any): boolean {
  return new Date() > new Date(cached.revalidate_at)
}
```

#### 外部APIフォールバック（オプション）
```typescript
// app/api/preview/external/route.ts - 外部APIフォールバック
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (process.env.METADATA_EXTERNAL_ENABLED !== 'true') {
    return Response.json({ error: 'External API disabled' }, { status: 403 })
  }
  
  const { url } = await request.json()
  
  try {
    // Microlink APIを使用（例）
    const microlinkResponse = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
      headers: {
        'X-API-Key': process.env.MICROLINK_API_KEY || ''
      }
    })
    
    const microlinkData = await microlinkResponse.json()
    
    if (microlinkData.status === 'success') {
      const metadata = {
        title: microlinkData.data.title || '',
        description: microlinkData.data.description || '',
        image: microlinkData.data.image?.url || '',
        favicon: microlinkData.data.logo?.url || '',
        siteName: microlinkData.data.publisher || '',
        url: microlinkData.data.url || url
      }
      
      return Response.json({
        success: true,
        data: metadata,
        source: 'external'
      })
    } else {
      throw new Error('External API failed')
    }
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'external' 
    }, { status: 500 })
  }
}
```

### 統合メタデータサービス
```typescript
// lib/services/metadata/index.ts
export class MetadataService {
  async extractMetadata(url: string): Promise<LinkPreview> {
    // 1. Edge でURL正規化
    const normalizeResult = await this.normalizeUrl(url)
    const normalizedUrl = normalizeResult.normalizedUrl
    
    // 2. Node でキャッシュチェック
    const cacheCheck = await this.checkCache(normalizedUrl)
    if (cacheCheck.cached) {
      return cacheCheck.data
    }
    
    let metadata: Partial<LinkPreview> = {}
    let source = 'node'
    
    // 2. Node でメイン抽出処理
    try {
      const nodeResult = await this.callNodeExtractor(normalizedUrl)
      metadata = nodeResult.data
      source = 'node'
    } catch (nodeError) {
      console.warn('Node extraction failed:', nodeError)
      
      // 3. 外部APIフォールバック（オプション）
      if (process.env.METADATA_EXTERNAL_ENABLED === 'true') {
        try {
          const externalResult = await this.callExternalExtractor(normalizedUrl)
          metadata = externalResult.data
          source = 'external'
        } catch (externalError) {
          console.warn('External API failed:', externalError)
          // フォールバック: 最低限のメタデータを生成
          metadata = this.generateFallbackMetadata(normalizedUrl)
          source = 'fallback'
        }
      } else {
        // 外部API無効時のフォールバック
        metadata = this.generateFallbackMetadata(normalizedUrl)
        source = 'fallback'
      }
    }
    
    // 4. 特定サイト専用処理（オプション）
    const handler = this.getSiteHandler(normalizedUrl)
    if (handler) {
      metadata = await handler(normalizedUrl, metadata)
    }
    
    // 5. キャッシュ保存と返却
    const preview = await this.savePreviewCache(normalizedUrl, metadata, source)
    return preview
  }
  
  private async normalizeUrl(url: string) {
    const response = await fetch(`/api/preview/normalize?url=${encodeURIComponent(url)}`)
    
    if (!response.ok) {
      throw new Error(`URL normalization failed: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  private async checkCache(normalizedUrl: string) {
    const response = await fetch('/api/preview/cache-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalizedUrl })
    })
    
    if (!response.ok) {
      throw new Error(`Cache check failed: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  private async callNodeExtractor(url: string) {
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    
    if (!response.ok) {
      throw new Error(`Node extraction failed: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  private async callExternalExtractor(url: string) {
    const response = await fetch('/api/preview/external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    
    if (!response.ok) {
      throw new Error(`External extraction failed: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  private generateFallbackMetadata(url: string): Partial<LinkPreview> {
    const urlObj = new URL(url)
    
    return {
      title: `${urlObj.hostname}`,
      description: `Link to ${urlObj.hostname}`,
      image: '',
      favicon: `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`,
      siteName: urlObj.hostname,
      url
    }
  }
  
  private getSiteHandler(url: string): ((url: string, metadata: any) => Promise<any>) | null {
    const urlObj = new URL(url)
    
    // Twitter/X専用ハンドラー（将来実装）
    if (urlObj.hostname.includes('twitter.com') || urlObj.hostname.includes('x.com')) {
      return this.handleTwitter
    }
    
    // YouTube専用ハンドラー（将来実装）
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      return this.handleYoutube
    }
    
    return null
  }
  
  private async handleTwitter(url: string, metadata: any) {
    // Twitter専用処理（将来実装）
    return metadata
  }
  
  private async handleYoutube(url: string, metadata: any) {
    // YouTube専用処理（将来実装）
    return metadata
  }
}
```

### セキュリティ・フェッチガード関数
```typescript
// lib/security/fetch-guard.ts - SSRF対策とセキュアフェッチ
import { Readable } from 'stream'
import * as iconv from 'iconv-lite'

// 最大本文サイズ（5MB）
const MAX_CONTENT_SIZE = 5 * 1024 * 1024
// 最大リダイレクト回数
const MAX_REDIRECTS = 5

export async function validateUrlForFetch(url: string): Promise<void> {
  const urlObj = new URL(url)
  
  // 1. プロトコル制限（http/https のみ許可）
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error(`Unsupported protocol: ${urlObj.protocol}`)
  }
  
  // 2. プライベートIP帯・localhost ブロック
  const hostname = urlObj.hostname.toLowerCase()
  
  // localhost 系
  if (['localhost', '127.0.0.1', '::1'].includes(hostname) ||
      hostname.startsWith('127.') ||
      hostname.endsWith('.localhost')) {
    throw new Error('Localhost access denied')
  }
  
  // プライベートIP帯チェック
  if (isPrivateIP(hostname)) {
    throw new Error('Private IP access denied')
  }
  
  // 3. 危険なポート番号チェック
  const dangerousPorts = [22, 23, 25, 53, 135, 139, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 6379, 27017]
  const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80)
  
  if (dangerousPorts.includes(port)) {
    throw new Error(`Dangerous port access denied: ${port}`)
  }
}

function isPrivateIP(hostname: string): boolean {
  // IPv4プライベートIP帯の正規表現
  const privateIPv4Patterns = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^169\.254\./,              // リンクローカル 169.254.0.0/16
  ]
  
  return privateIPv4Patterns.some(pattern => pattern.test(hostname))
}

export async function safeFetch(url: string): Promise<string> {
  let currentUrl = url
  let redirectCount = 0
  
  while (redirectCount <= MAX_REDIRECTS) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'EncoreBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8', // 日本語サイト対応
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache'
      },
      redirect: 'manual', // 手動でリダイレクト制御
      signal: AbortSignal.timeout(10000)
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
      throw new Error(`Invalid content type: ${contentType}. Only text/html is allowed.`)
    }
    
    // Content-Length チェック
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_CONTENT_SIZE) {
      throw new Error(`Content too large: ${contentLength} bytes (max: ${MAX_CONTENT_SIZE})`)
    }
    
    // エンコーディング検出とストリーミング取得
    const encoding = detectEncoding(response.headers.get('content-type'))
    const html = await fetchAndDecode(response, encoding)
    
    return html
  }
  
  throw new Error(`Too many redirects: ${redirectCount}`)
}

function detectEncoding(contentType: string | null): string {
  if (!contentType) return 'utf-8'
  
  // Content-Typeからcharsetを抽出
  const charsetMatch = contentType.match(/charset=([^;]+)/i)
  if (charsetMatch) {
    const charset = charsetMatch[1].trim().toLowerCase()
    
    // 日本語エンコーディングの正規化
    const encodingMap: { [key: string]: string } = {
      'shift_jis': 'shift_jis',
      'shift-jis': 'shift_jis', 
      'sjis': 'shift_jis',
      'x-sjis': 'shift_jis',
      'euc-jp': 'euc-jp',
      'eucjp': 'euc-jp',
      'iso-2022-jp': 'iso-2022-jp',
      'utf-8': 'utf-8',
      'utf8': 'utf-8'
    }
    
    return encodingMap[charset] || 'utf-8'
  }
  
  return 'utf-8'
}

async function fetchAndDecode(response: Response, encoding: string): Promise<string> {
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
        throw new Error(`Content too large during streaming: ${totalSize} bytes`)
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
      // その他のエンコーディングの場合はiconv-liteを使用
      if (!iconv.encodingExists(encoding)) {
        console.warn(`Unsupported encoding: ${encoding}, falling back to utf-8`)
        html = new TextDecoder('utf-8').decode(buffer)
      } else {
        html = iconv.decode(buffer, encoding)
      }
    }
    
    // HTMLからメタタグのcharsetもチェック（Content-Typeが間違っている場合の補完）
    const detectedEncoding = detectEncodingFromMeta(html)
    if (detectedEncoding && detectedEncoding !== encoding) {
      console.warn(`Content-Type charset (${encoding}) differs from HTML meta charset (${detectedEncoding})`)
      
      // 文字化けしている可能性がある場合は再デコード
      if (isLikelyGarbled(html) && detectedEncoding !== encoding) {
        try {
          html = iconv.decode(buffer, detectedEncoding)
          console.info(`Re-decoded with detected encoding: ${detectedEncoding}`)
        } catch (error) {
          console.warn('Re-decoding failed, keeping original:', error)
        }
      }
    }
    
    return html
    
  } finally {
    reader.releaseLock()
  }
}

function detectEncodingFromMeta(html: string): string | null {
  // HTMLの先頭部分からmeta charsetを検出
  const metaCharsetMatch = html.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)
  if (metaCharsetMatch) {
    const charset = metaCharsetMatch[1].toLowerCase()
    
    const encodingMap: { [key: string]: string } = {
      'shift_jis': 'shift_jis',
      'shift-jis': 'shift_jis',
      'sjis': 'shift_jis',
      'euc-jp': 'euc-jp',
      'iso-2022-jp': 'iso-2022-jp',
      'utf-8': 'utf-8'
    }
    
    return encodingMap[charset] || null
  }
  
  return null
}

function isLikelyGarbled(html: string): boolean {
  // 日本語文字化けの典型的パターンを検出
  const garbledPatterns = [
    /[\u00C0-\u00FF]{3,}/, // 連続する拡張ASCII文字（Shift_JIS→UTF-8誤変換）
    /\ufffd{2,}/,          // 連続する置換文字（？マーク）
    /縺[縺-繧繝]/,        // Shift_JIS→UTF-8文字化けの典型パターン
  ]
  
  return garbledPatterns.some(pattern => pattern.test(html))
}
```

### 依存関係（package.json）
```json
{
  "dependencies": {
    "cheerio": "^1.0.0-rc.12",
    "@mozilla/readability": "^0.4.4",
    "jsdom": "^23.0.1",
    "iconv-lite": "^0.6.3"
  },
  "devDependencies": {
    "@types/jsdom": "^21.1.6",
    "@types/iconv-lite": "^0.0.3"
  }
}
```

## キャッシュ・再取得戦略

### キャッシュライフサイクル
```typescript
// キャッシュ管理サービス
export class CacheManager {
  // 初回取得時
  async savePreviewCache(url: string, metadata: LinkPreview, source: string): Promise<LinkPreview> {
    const preview = {
      url,
      ...metadata,
      source,
      status: this.determineStatus(metadata),
      fetched_at: new Date(),
      revalidate_at: new Date(Date.now() + this.getTTL(source)),
      retry_count: 0
    }
    
    return await supabase.from('link_previews').upsert(preview).single()
  }
  
  // TTL設定（ソース別）
  private getTTL(source: string): number {
    const ttlMap = {
      'edge': 7 * 24 * 60 * 60 * 1000,     // 7日
      'node': 14 * 24 * 60 * 60 * 1000,    // 14日
      'external': 30 * 24 * 60 * 60 * 1000, // 30日
      'failed': 6 * 60 * 60 * 1000         // 6時間（失敗時）
    }
    return ttlMap[source] || ttlMap['edge']
  }
  
  // ステータス判定
  private determineStatus(metadata: LinkPreview): string {
    if (metadata.title && (metadata.description || metadata.image)) {
      return 'success'
    } else if (metadata.title) {
      return 'partial'
    } else {
      return 'failed'
    }
  }
  
  // 手動再取得
  async forceRevalidate(url: string): Promise<LinkPreview> {
    // キャッシュを無視して再取得
    return await this.metadataService.extractMetadata(url)
  }
}
```

### バックグラウンド再取得（Vercel Cron）

#### 再取得運用ポリシー
- **実行頻度**: 1日1回（深夜時間帯）
- **処理上限**: 1回あたり最大100件のプレビューを処理
- **対象選定**: 期限切れの成功プレビューを優先、失敗プレビューは指数的バックオフ
- **バックオフ戦略**: 失敗回数に応じて再試行確率を低下（0.5^retry_count）
- **レートリミット**: リクエスト間に100ms遅延、外部API負荷を考慮

```typescript
// app/api/cron/revalidate/route.ts
export async function GET(request: Request) {
  // 認証チェック
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  try {
    // 再取得対象を優先度順で抽出（上位100件）
    // 1. 成功プレビューの期限切れ（最優先）
    // 2. 失敗プレビューの指数的バックオフ対象
    const expiredPreviews = await supabase
      .from('link_previews')
      .select('url, status, retry_count, fetched_at')
      .lt('revalidate_at', new Date().toISOString())
      .order('status', { ascending: false }) // 'success' > 'partial' > 'failed'
      .order('fetched_at', { ascending: true }) // 古いものから優先
      .limit(100)
    
    const results = []
    
    let processedCount = 0
    let successCount = 0
    let errorCount = 0
    
    for (const preview of expiredPreviews.data || []) {
      try {
        // 指数的バックオフチェック（失敗プレビューのみ）
        if (preview.status === 'failed') {
          const backoffProbability = Math.pow(0.5, preview.retry_count)
          if (Math.random() > backoffProbability) {
            results.push({ url: preview.url, status: 'skipped', reason: 'backoff' })
            continue
          }
        }
        
        const updated = await metadataService.extractMetadata(preview.url)
        results.push({ url: preview.url, status: 'updated', source: updated.source })
        successCount++
        
        // レートリミットを考慮して遅延（外部API保護）
        await new Promise(resolve => setTimeout(resolve, 100))
        processedCount++
        
      } catch (error) {
        results.push({ 
          url: preview.url, 
          status: 'error', 
          error: error.message,
          retry_count: preview.retry_count + 1
        })
        errorCount++
        processedCount++
      }
    }
    
    return Response.json({ 
      success: true, 
      summary: {
        total_candidates: expiredPreviews.data?.length || 0,
        processed: processedCount,
        updated: successCount,
        errors: errorCount,
        skipped: results.filter(r => r.status === 'skipped').length
      },
      results 
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
```

### 手動再取得UI
```typescript
// components/bookmarks/refresh-preview-button.tsx
export function RefreshPreviewButton({ bookmark }: { bookmark: Bookmark }) {
  const [isLoading, setIsLoading] = useState(false)
  
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      await fetch('/api/bookmarks/refresh-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId: bookmark.id })
      })
      
      // UI更新
      router.refresh()
    } catch (error) {
      console.error('Preview refresh failed:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <button onClick={handleRefresh} disabled={isLoading}>
      {isLoading ? <Spinner /> : <RefreshIcon />}
      再取得
    </button>
  )
}
```

## 抽出優先度とデータ正規化

### 抽出優先度
```typescript
// タイトル優先度
const title = 
  $('meta[property="og:title"]').attr('content') ||
  $('meta[name="twitter:title"]').attr('content') ||
  $('title').text().trim()

// 説明優先度  
const description =
  $('meta[property="og:description"]').attr('content') ||
  $('meta[name="twitter:description"]').attr('content') ||
  $('meta[name="description"]').attr('content') ||
  await extractWithReadability(url) // Nodeのみ

// 画像優先度
const image =
  $('meta[property="og:image"]').attr('content') ||
  $('meta[name="twitter:image"]').attr('content') ||
  $('meta[name="twitter:image:src"]').attr('content') ||
  $('link[rel="apple-touch-icon"]').attr('href') ||
  $('link[rel="icon"]').attr('href')
```

### データ正規化ルール
```typescript
export function normalizeUrl(url: string): string {
  const urlObj = new URL(url)
  
  // 1. ホスト名の小文字化
  urlObj.hostname = urlObj.hostname.toLowerCase()
  
  // 2. デフォルトポート削除
  if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
      (urlObj.protocol === 'https:' && urlObj.port === '443')) {
    urlObj.port = ''
  }
  
  // 3. フラグメント除去
  urlObj.hash = ''
  
  // 4. トラッキングパラメータ除去
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid', 'ref', 'source'
  ]
  
  trackingParams.forEach(param => {
    urlObj.searchParams.delete(param)
  })
  
  // 5. クエリキーのソート（残すもの）
  const sortedParams = new URLSearchParams()
  Array.from(urlObj.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => sortedParams.append(key, value))
  urlObj.search = sortedParams.toString()
  
  // 6. 末尾スラッシュ統一（パスがルートでない場合のみ削除）
  let normalizedUrl = urlObj.toString()
  if (urlObj.pathname !== '/' && normalizedUrl.endsWith('/')) {
    normalizedUrl = normalizedUrl.slice(0, -1)
  }
  
  return normalizedUrl
}

export function makeAbsoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

## 導入順序（現実的な段階実装）

### Phase 1: コア機能MVP
1. `/api/preview` NodeルートのCheerio実装（メイン抽出処理）
2. `link_previews`テーブル作成
3. 基本URL正規化機能
4. ブックマーク保存時のメタデータ連携

### Phase 2: セキュリティ・エンコーディング強化
5. SSRF対策・フェッチガード実装（`lib/security/fetch-guard.ts`）
6. プライベートIP・localhost・危険ポートブロック
7. Content-Type制限・リダイレクト制御・サイズ制限
8. エンコーディング検出機能（Content-Type charset + HTML meta検出）
9. 日本語サイト対応（Shift_JIS、EUC-JP対応、文字化け自動修復）

### Phase 3: パフォーマンス最適化  
10. `/api/preview/normalize` Edgeルート（URL正規化）実装
11. `/api/preview/cache-check` Nodeルート（キャッシュチェック）実装
12. Readabilityによる本文抜粋強化
13. 基本キャッシュライフサイクル管理

### Phase 4: 堅牢性向上
14. エラーハンドリング強化
15. フォールバックメタデータ生成
16. リトライ機能とタイムアウト調整

### Phase 5: 外部API連携（オプション）
17. `/api/preview/external`ルート実装
18. Microlink API連携
19. 環境変数で有効/無効切り替え

### Phase 6: 運用機能
20. Vercel Cronでのバックグラウンド再取得
21. 手動再取得ボタン
22. 特定サイト専用ハンドラー（Twitter、YouTube等）
23. 多層レートリミット実装
24. 指数的バックオフによる失敗リンク管理

### 技術的な利点
- **Vercel完全対応**: HTMLRewriterの制約から解放
- **依存関係明確**: cheerio, jsdom, readability, iconv-liteの組み合わせ
- **段階的移行可能**: 将来Edge最適化が必要な場合も分離しやすい構成
- **セキュリティ強化**: SSRF対策、プライベートIPブロック、サイズ制限等の多層防御
- **適切な責務分離**: Edge（軽量処理）とNode（DB/複雑処理）の明確な分担
- **認証セキュリティ**: EdgeでSupabase直参照を避け、RLS制御はNode経由
- **日本語サイト最適化**: Accept-Language対応による日本語OGP取得安定化
- **マルチエンコーディング対応**: Shift_JIS、EUC-JP等の日本語サイトでの文字化け回避
- **インテリジェントデコード**: Content-Type charset検出 + HTML meta補完 + 文字化け自動修復
- **デバッグ容易**: Node.jsランタイムで完全なログとエラー情報
- **メンテナンス性**: 一般的なライブラリによる実装で保守が容易