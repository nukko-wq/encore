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
│   │   │   ├── revalidate/
│   │   │   │   └── route.ts      -- バックグラウンド再取得
│   │   │   └── external-api-summary/
│   │   │       └── route.ts      -- 外部API使用状況日次集計
├── lib/
│   ├── url-normalization.ts         -- 統一URL正規化（Edge/Node/Client共通）
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
- **URL正規化**: Edge/Node/Client間で同一実装を使用（差し戻し対策）

### 統一URL正規化モジュール
```typescript
// lib/url-normalization.ts - Edge/Node/Client共通正規化ロジック
// IMPORTANT: この実装をEdge/Node/Clientで必ず共有すること

/**
 * URL正規化関数（重複防止・差し戻し対策）
 * Edge/Node/Client間で完全に同一の実装を使用する
 */
export function normalizeUrl(url: string): string {
  try {
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
    
    // 4. トラッキングパラメータ除去（統一リスト）
    const trackingParams = [
      // Google Analytics & Ads
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
      '_ga', '_gl', 'gclid', 'gclsrc', 'dclid', 'wbraid', 'gbraid',
      
      // Facebook & Social
      'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_ref', 'fb_source',
      
      // Microsoft
      'msclkid', 'mc_eid', 'mc_cid',
      
      // Other tracking
      'ref', 'source', 'campaign', 'medium', 'content',
      '_hsenc', '_hsmi', 'hsCtaTracking', // HubSpot
      'vero_conv', 'vero_id', // Vero
      'pk_campaign', 'pk_kwd', 'pk_medium', 'pk_source', // Piwik/Matomo
      
      // Email tracking
      'email_source', 'email_campaign', 'email_id'
    ]
    
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param)
    })
    
    // 5. クエリキーのソート（残存パラメータの順序統一）
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
    
  } catch (error) {
    // URL形式エラー時は元のURLを返す
    console.warn('URL normalization failed:', error)
    return url
  }
}

/**
 * URL正規化の妥当性検証（開発/テスト用）
 * 正規化前後でのURL整合性をチェック
 */
export function validateNormalization(originalUrl: string, normalizedUrl: string): boolean {
  try {
    const original = new URL(originalUrl)
    const normalized = new URL(normalizedUrl)
    
    // 基本要素が保持されていることを確認
    return (
      original.protocol === normalized.protocol &&
      original.hostname.toLowerCase() === normalized.hostname &&
      original.pathname === normalized.pathname
    )
  } catch {
    return false
  }
}

/**
 * 相対URL→絶対URL変換（<base href>対応）
 */
export function makeAbsoluteUrl(href: string, baseUrl: string, $?: any): string {
  try {
    let effectiveBaseUrl = baseUrl
    
    // CheerioオブジェクトがあればHTML内の<base href>をチェック
    if ($ && typeof $ === 'function') {
      const baseHref = $('base[href]').attr('href')
      if (baseHref) {
        try {
          // <base href>が見つかった場合、それを基準URLとして使用
          effectiveBaseUrl = new URL(baseHref, baseUrl).href
        } catch (error) {
          console.warn('Invalid base href detected, using original baseUrl:', baseHref, error)
        }
      }
    }
    
    return new URL(href, effectiveBaseUrl).href
  } catch {
    return ''
  }
}
```

### APIルート構成

#### メインメタデータ抽出（Node）
```typescript
// app/api/preview/route.ts - メイン抽出処理（Node.js Runtime）
export const runtime = 'nodejs'

import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { validateUrlForFetch, safeFetch } from '@/lib/security/fetch-guard'
import { normalizeUrl, makeAbsoluteUrl } from '@/lib/url-normalization'

export async function POST(request: Request) {
  const { url } = await request.json()
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    // SSRF対策: URL検証
    await validateUrlForFetch(url)
    
    // セキュアなfetch処理
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    
    // OGP/メタデータ抽出（優先度・解像度優先）
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
    
    // 高品質・安全な画像を優先選択
    const image = selectBestImage($, url)
    
    const siteName = 
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="application-name"]').attr('content') ||
      ''
    
    // 高解像度アイコンを優先選択
    const favicon = selectBestIcon($, url)
    
    // 相対URLを絶対URLに変換（<base href>考慮）
    const absoluteImage = image ? makeAbsoluteUrl(image, url, $) : ''
    const absoluteFavicon = favicon ? makeAbsoluteUrl(favicon, url, $) : ''
    
    // descriptionが無い場合はReadabilityで本文抜粋
    let extractedDescription = description
    if (!extractedDescription && html) {
      try {
        const dom = new JSDOM(html, { url })
        const reader = new Readability(dom.window.document)
        const article = reader.parse()
        
        if (article?.textContent) {
          // 日本語対応: Unicode安全なトリミング（全角160-200文字程度）
          const cleanText = article.textContent.replace(/\s+/g, ' ').trim()
          extractedDescription = safeTextTrim(cleanText, 200)
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

import { normalizeUrl } from '@/lib/url-normalization'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    // 統一モジュールによるURL正規化（Edge/Node/Client共通）
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

#### 外部APIフォールバック（レート制御・ログ対応）
```typescript
// app/api/preview/external/route.ts - 外部APIフォールバック
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// レート制限設定
const RATE_LIMITS = {
  user: {
    requests: 10,       // 認証ユーザー：10回/時間
    window: 60 * 60 * 1000
  },
  ip: {
    requests: 5,        // 未認証：5回/時間
    window: 60 * 60 * 1000
  }
}

export async function POST(request: Request) {
  if (process.env.METADATA_EXTERNAL_ENABLED !== 'true') {
    return Response.json({ error: 'External API disabled' }, { status: 403 })
  }
  
  const { url } = await request.json()
  const clientIP = getClientIP(request)
  const startTime = Date.now()
  
  try {
    // 認証チェック
    const { data: { user } } = await supabase.auth.getUser()
    
    // レート制限チェック
    await checkRateLimit(user?.id, clientIP)
    
    // 外部API呼び出し
    const metadata = await callExternalAPI(url)
    
    // 成功ログ記録
    await logExternalAPIUsage({
      userId: user?.id,
      clientIP,
      url,
      success: true,
      responseTime: Date.now() - startTime,
      source: 'microlink'
    })
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'external'
    })
    
  } catch (error) {
    // 失敗ログ記録
    await logExternalAPIUsage({
      userId: (await supabase.auth.getUser()).data.user?.id,
      clientIP,
      url,
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime,
      source: 'microlink'
    })
    
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'external' 
    }, { status: 500 })
  }
}

function getClientIP(request: Request): string {
  const headersList = headers()
  
  return (
    headersList.get('x-forwarded-for')?.split(',')[0] ||
    headersList.get('x-real-ip') ||
    headersList.get('cf-connecting-ip') ||
    'unknown'
  )
}

async function checkRateLimit(userId: string | undefined, clientIP: string): Promise<void> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - (userId ? RATE_LIMITS.user.window : RATE_LIMITS.ip.window))
  
  // ユーザーIDベースのレート制限（優先）
  if (userId) {
    const { count } = await supabase
      .from('external_api_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', windowStart.toISOString())
    
    if (count && count >= RATE_LIMITS.user.requests) {
      throw new Error(`Rate limit exceeded for user: ${RATE_LIMITS.user.requests} requests/hour`)
    }
  } else {
    // IPベースのレート制限（フォールバック）
    const { count } = await supabase
      .from('external_api_logs')
      .select('*', { count: 'exact', head: true })
      .eq('client_ip', clientIP)
      .is('user_id', null)
      .gte('created_at', windowStart.toISOString())
    
    if (count && count >= RATE_LIMITS.ip.requests) {
      throw new Error(`Rate limit exceeded for IP: ${RATE_LIMITS.ip.requests} requests/hour`)
    }
  }
}

async function callExternalAPI(url: string): Promise<any> {
  const microlinkResponse = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
    headers: {
      'X-API-Key': process.env.MICROLINK_API_KEY || '',
      'User-Agent': 'EncoreBot/1.0'
    },
    signal: AbortSignal.timeout(30000) // 30秒タイムアウト
  })
  
  if (!microlinkResponse.ok) {
    throw new Error(`Microlink API error: ${microlinkResponse.status} ${microlinkResponse.statusText}`)
  }
  
  const microlinkData = await microlinkResponse.json()
  
  if (microlinkData.status !== 'success') {
    throw new Error(`Microlink API failed: ${microlinkData.message || 'Unknown error'}`)
  }
  
  return {
    title: microlinkData.data.title || '',
    description: microlinkData.data.description || '',
    image: microlinkData.data.image?.url || '',
    favicon: microlinkData.data.logo?.url || '',
    siteName: microlinkData.data.publisher || '',
    url: microlinkData.data.url || url
  }
}

async function logExternalAPIUsage(logData: {
  userId?: string
  clientIP: string
  url: string
  success: boolean
  responseTime: number
  source: string
  error?: string
}): Promise<void> {
  try {
    await supabase.from('external_api_logs').insert({
      user_id: logData.userId || null,
      client_ip: logData.clientIP,
      url: logData.url,
      success: logData.success,
      response_time_ms: logData.responseTime,
      api_source: logData.source,
      error_message: logData.error || null,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to log external API usage:', error)
    // ログ失敗は本処理に影響させない
  }
}
```

### 統合メタデータサービス
```typescript
// lib/services/metadata/index.ts
import { normalizeUrl } from '@/lib/url-normalization'

export class MetadataService {
  async extractMetadata(url: string): Promise<LinkPreview> {
    // 1. 統一モジュールによるURL正規化（直接使用でも可）
    let normalizedUrl: string
    
    // オプション1: Edge経由での正規化（分散処理）
    try {
      const normalizeResult = await this.normalizeUrl(url)
      normalizedUrl = normalizeResult.normalizedUrl
    } catch (error) {
      // オプション2: 統一モジュールによる直接正規化（フォールバック）
      console.warn('Edge normalization failed, using direct normalization:', error)
      normalizedUrl = normalizeUrl(url)
    }
    
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

function selectBestImage($: any, baseUrl: string): string {
  const candidates: Array<{
    url: string
    width?: number
    height?: number
    priority: number
    isSecure: boolean
  }> = []
  
  // 1. OG画像（secure_url優先、サイズ情報付き）
  const ogImage = $('meta[property="og:image"]').attr('content')
  const ogImageSecure = $('meta[property="og:image:secure_url"]').attr('content')
  const ogImageWidth = parseInt($('meta[property="og:image:width"]').attr('content') || '0')
  const ogImageHeight = parseInt($('meta[property="og:image:height"]').attr('content') || '0')
  
  if (ogImageSecure) {
    candidates.push({
      url: ogImageSecure,
      width: ogImageWidth || undefined,
      height: ogImageHeight || undefined,
      priority: 100, // 最高優先度（secure + OG）
      isSecure: true
    })
  } else if (ogImage) {
    candidates.push({
      url: ogImage,
      width: ogImageWidth || undefined,
      height: ogImageHeight || undefined,
      priority: 90, // 高優先度（OG）
      isSecure: ogImage.startsWith('https:')
    })
  }
  
  // 2. Twitter画像
  const twitterImage = $('meta[name="twitter:image"]').attr('content')
  if (twitterImage) {
    candidates.push({
      url: twitterImage,
      priority: 80, // 中高優先度
      isSecure: twitterImage.startsWith('https:')
    })
  }
  
  // 3. Apple touch icon（高解像度）
  $('link[rel="apple-touch-icon"]').each((_: number, elem: any) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')
    if (href) {
      let size = 0
      if (sizes) {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1])
        }
      }
      
      candidates.push({
        url: href,
        width: size || undefined,
        height: size || undefined,
        priority: 70, // 中優先度
        isSecure: href.startsWith('https:')
      })
    }
  })
  
  // 4. 通常のリンク（rel="icon"）
  $('link[rel*="icon"]').each((_: number, elem: any) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')
    const type = $(elem).attr('type')
    
    if (href) {
      let size = 0
      if (sizes && sizes !== 'any') {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1])
        }
      }
      
      // SVGは高優先度
      const priority = type?.includes('svg') ? 65 : 60
      
      candidates.push({
        url: href,
        width: size || undefined,
        height: size || undefined,
        priority: priority,
        isSecure: href.startsWith('https:')
      })
    }
  })
  
  // 候補のフィルタリング・ソート
  const filtered = candidates
    .filter(candidate => {
      // data:スキーム除外
      if (candidate.url.startsWith('data:')) return false
      
      // 明らかに小さすぎる画像は除外
      if (candidate.width && candidate.width < 16) return false
      if (candidate.height && candidate.height < 16) return false
      
      return true
    })
    .sort((a, b) => {
      // 1. セキュリティ（HTTPS）優先
      if (a.isSecure !== b.isSecure) {
        return b.isSecure ? 1 : -1
      }
      
      // 2. 優先度
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      
      // 3. サイズ（大きいほうが高品質）
      const aSize = (a.width || 0) * (a.height || 0)
      const bSize = (b.width || 0) * (b.height || 0)
      
      if (aSize !== bSize) {
        return bSize - aSize
      }
      
      return 0
    })
  
  return filtered[0]?.url || ''
}

function selectBestIcon($: any, baseUrl: string): string {
  const candidates: Array<{
    url: string
    size: number
    priority: number
    isSecure: boolean
  }> = []
  
  // 1. Apple touch icon（高解像度）
  $('link[rel="apple-touch-icon"]').each((_: number, elem: any) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')
    
    if (href) {
      let size = 152 // Apple touch iconのデフォルトサイズ
      if (sizes) {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1])
        }
      }
      
      candidates.push({
        url: href,
        size,
        priority: 90, // 高優先度
        isSecure: href.startsWith('https:')
      })
    }
  })
  
  // 2. 通常のアイコン（サイズ指定付き）
  $('link[rel*="icon"]').each((_: number, elem: any) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')
    const type = $(elem).attr('type')
    
    if (href) {
      let size = 16 // デフォルトサイズ
      let priority = 70
      
      if (sizes && sizes !== 'any') {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1])
        }
      }
      
      // SVGは高優先度（解像度に依存しない）
      if (type?.includes('svg')) {
        priority = 85
        size = 1000 // SVGは大サイズ扱い
      }
      
      candidates.push({
        url: href,
        size,
        priority,
        isSecure: href.startsWith('https:')
      })
    }
  })
  
  // 3. フォールバック
  candidates.push({
    url: '/favicon.ico',
    size: 16,
    priority: 10, // 最低優先度
    isSecure: false
  })
  
  // 候補のフィルタリング・ソート
  const filtered = candidates
    .filter(candidate => {
      // data:スキーム除外
      return !candidate.url.startsWith('data:')
    })
    .sort((a, b) => {
      // 1. セキュリティ（HTTPS）優先
      if (a.isSecure !== b.isSecure) {
        return b.isSecure ? 1 : -1
      }
      
      // 2. 優先度
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      
      // 3. サイズ（大きいほうが高品質）
      return b.size - a.size
    })
  
  return filtered[0]?.url || '/favicon.ico'
}

function safeTextTrim(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text
  }
  
  // Intl.Segmenterが利用可能かチェック（Node.js 16+、最新ブラウザ）
  if (typeof Intl.Segmenter !== 'undefined') {
    try {
      // 日本語対応の文字素単位でセグメント化
      const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })
      const segments = [...segmenter.segment(text)]
      
      if (segments.length <= maxLength) {
        return text
      }
      
      // maxLength文字素まで取得
      const trimmedSegments = segments.slice(0, maxLength)
      const trimmedText = trimmedSegments.map(s => s.segment).join('')
      
      // 語尾が綺麗になるよう調整
      return trimmedText + (segments.length > maxLength ? '...' : '')
      
    } catch (error) {
      console.warn('Intl.Segmenter failed, falling back to simple trim:', error)
    }
  }
  
  // フォールバック: 従来の方法（結合文字で少し安全に）
  return safeSubstring(text, maxLength) + (text.length > maxLength ? '...' : '')
}

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
    if (char.charCodeAt(0) >= 0xD800 && char.charCodeAt(0) <= 0xDBFF) {
      // 次の文字が低サロゲートかチェック
      if (i + 1 < text.length) {
        const nextChar = text[i + 1]
        if (nextChar.charCodeAt(0) >= 0xDC00 && nextChar.charCodeAt(0) <= 0xDFFF) {
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

### 外部APIサマリー集計（日次運用監視）
```typescript
// app/api/cron/external-api-summary/route.ts - 外部API使用状況の日次集計
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // サービスロールキーが必要
)

export async function GET(request: Request) {
  // 認証チェック（Vercel Cron Secret）
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0] // YYYY-MM-DD
    
    // API source別に集計
    const { data: apiSources } = await supabase
      .from('external_api_logs')
      .select('api_source')
      .gte('created_at', `${dateStr}T00:00:00Z`)
      .lt('created_at', `${dateStr}T23:59:59Z`)
      .group('api_source')
    
    const summaries = []
    
    for (const source of apiSources || []) {
      const { api_source } = source
      
      // 詳細集計クエリ
      const { data: stats } = await supabase
        .rpc('calculate_external_api_summary', {
          target_date: dateStr,
          target_source: api_source
        })
      
      if (stats && stats.length > 0) {
        const summary = stats[0]
        
        // サマリーテーブルに挿入（UPSERT）
        await supabase
          .from('external_api_summary')
          .upsert({
            date: dateStr,
            api_source,
            total_requests: summary.total_requests,
            success_requests: summary.success_requests,
            failed_requests: summary.failed_requests,
            avg_response_time_ms: Math.round(summary.avg_response_time_ms),
            unique_users: summary.unique_users,
            unique_ips: summary.unique_ips
          }, {
            onConflict: 'date,api_source'
          })
        
        summaries.push({
          api_source,
          date: dateStr,
          ...summary
        })
      }
    }
    
    return Response.json({
      success: true,
      date: dateStr,
      summaries
    })
    
  } catch (error) {
    console.error('External API summary failed:', error)
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
```

#### PostgreSQL集計関数
```sql
-- Supabase DB内で定義する集計関数
CREATE OR REPLACE FUNCTION calculate_external_api_summary(target_date text, target_source text)
RETURNS TABLE(
  total_requests bigint,
  success_requests bigint,
  failed_requests bigint,
  avg_response_time_ms numeric,
  unique_users bigint,
  unique_ips bigint
) 
LANGUAGE sql
AS $$
  SELECT 
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE success = true) as success_requests,
    COUNT(*) FILTER (WHERE success = false) as failed_requests,
    AVG(response_time_ms) as avg_response_time_ms,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
    COUNT(DISTINCT client_ip) as unique_ips
  FROM external_api_logs 
  WHERE 
    api_source = target_source 
    AND created_at >= (target_date || 'T00:00:00Z')::timestamptz
    AND created_at < (target_date || 'T23:59:59Z')::timestamptz;
$$;
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

### 抽出優先度・解像度優先ロジック
```typescript
// タイトル優先度（変更なし）
const title = 
  $('meta[property="og:title"]').attr('content') ||
  $('meta[name="twitter:title"]').attr('content') ||
  $('title').text().trim()

// 説明優先度（Readability強化）
const description =
  $('meta[property="og:description"]').attr('content') ||
  $('meta[name="twitter:description"]').attr('content') ||
  $('meta[name="description"]').attr('content') ||
  await extractWithReadability(url) // Unicode安全なトリミング適用

// 画像優先度（大幅強化）
const image = selectBestImage($, url) // 以下の基準で選択：
// 1. og:image:secure_url (優先度100, HTTPS保証)
// 2. og:image + サイズ情報 (優先度90)
// 3. twitter:image (優先度80)
// 4. apple-touch-icon + サイズ (優先度70)
// 5. link[rel="icon"] + SVG対応 (優先度65/60)
// - HTTPS優先、サイズ優先（大きいほど高品質）
// - data:スキーム除外、16px未満除外

// アイコン優先度（強化）
const favicon = selectBestIcon($, url) // 以下の基準で選択：
// 1. apple-touch-icon + サイズ (優先度90, デフォルト152px)
// 2. link[rel="icon"] SVG (優先度85, 解像度独立)
// 3. link[rel="icon"] + サイズ (優先度70)
// 4. /favicon.ico (優先度10, フォールバック)
// - HTTPS優先、大サイズ優先、data:スキーム除外
```

### クライアント・フロントエンド連携
```typescript
// components/bookmark-form.tsx - フロントエンドでも統一正規化
import { normalizeUrl, validateNormalization } from '@/lib/url-normalization'

export function BookmarkForm() {
  const handleSubmit = (url: string) => {
    // フロントエンドでも同じ正規化を適用（UX向上）
    const normalizedUrl = normalizeUrl(url)
    
    // 正規化の妥当性を確認
    if (!validateNormalization(url, normalizedUrl)) {
      console.warn('URL normalization validation failed')
    }
    
    // 正規化済みURLでブックマーク作成
    createBookmark(normalizedUrl)
  }
}

// Chrome拡張機能でも同じ正規化を使用
// extension/content.js
import { normalizeUrl } from '@/lib/url-normalization'

chrome.runtime.sendMessage({
  action: 'saveBookmark',
  url: normalizeUrl(window.location.href) // 統一正規化適用
})
```

## 導入順序（現実的な段階実装）

### Phase 1: コア機能MVP
1. 統一URL正規化モジュール作成（`lib/url-normalization.ts`）
2. `/api/preview` NodeルートのCheerio実装（メイン抽出処理）
3. `link_previews`テーブル作成
4. ブックマーク保存時のメタデータ連携

### Phase 2: セキュリティ・エンコーディング・画像・文字処理強化
5. SSRF対策・フェッチガード実装（`lib/security/fetch-guard.ts`）
6. プライベートIP・localhost・危険ポートブロック
7. Content-Type制限・リダイレクト制御・サイズ制限
8. エンコーディング検出機能（Content-Type charset + HTML meta検出）
9. 日本語サイト対応（Shift_JIS、EUC-JP対応、文字化け自動修復）
10. 画像・アイコン選択強化（解像度優先、secure_url優先、data:スキーム除外）
11. Unicode安全なテキストトリミング（Intl.Segmenter、結合文字・サロゲートペア対応）
12. `<base href>`タグ対応（相対URL解決時に document.baseURI 優先使用）

### Phase 3: パフォーマンス最適化  
13. `/api/preview/normalize` Edgeルート実装（統一正規化モジュール使用）
14. `/api/preview/cache-check` Nodeルート（キャッシュチェック）実装
15. フロントエンド・Chrome拡張での統一正規化適用
16. Readabilityによる本文抜粋強化
17. 基本キャッシュライフサイクル管理

### Phase 4: 堅牢性向上
18. エラーハンドリング強化
19. フォールバックメタデータ生成
20. リトライ機能とタイムアウト調整

### Phase 5: 外部API連携（オプション）
21. `/api/preview/external`ルート実装（レート制御・ログ対応）
22. `external_api_logs`テーブル作成・インデックス設定
23. ユーザーID + IPベースのレート制限実装（10回/時間 認証、5回/時間 未認証）
24. レスポンス時間・成功率・エラーメッセージの詳細ログ記録
25. Microlink API連携・タイムアウト設定
26. 環境変数で有効/無効切り替え

### Phase 6: 運用機能
27. `external_api_summary`テーブル作成・PostgreSQL集計関数実装
28. 外部API使用状況の日次集計Cronジョブ（`/api/cron/external-api-summary`）
29. Vercel Cronでのバックグラウンド再取得
30. 手動再取得ボタン
31. 特定サイト専用ハンドラー（Twitter、YouTube等）
32. 多層レートリミット実装（メタデータ抽出全般）
33. 指数的バックオフによる失敗リンク管理

### 技術的な利点
- **Vercel完全対応**: HTMLRewriterの制約から解放
- **依存関係明確**: cheerio, jsdom, readability, iconv-liteの組み合わせ
- **段階的移行可能**: 将来Edge最適化が必要な場合も分離しやすい構成
- **URL正規化統一**: Edge/Node/Client間で完全に同一の実装による差し戻し対策
- **セキュリティ強化**: SSRF対策、プライベートIPブロック、サイズ制限等の多層防御
- **適切な責務分離**: Edge（軽量処理）とNode（DB/複雑処理）の明確な分担
- **認証セキュリティ**: EdgeでSupabase直参照を避け、RLS制御はNode経由
- **日本語サイト最適化**: Accept-Language対応による日本語OGP取得安定化
- **マルチエンコーディング対応**: Shift_JIS、EUC-JP等の日本語サイトでの文字化け回避
- **インテリジェントデコード**: Content-Type charset検出 + HTML meta補完 + 文字化け自動修復
- **高品質画像選択**: secure_url優先、解像度ベース選択、data:スキーム除外
- **最適アイコン選択**: 複数サイズ・形式から最高解像度を自動選択（SVG、Apple touch icon対応）
- **Unicode完全対応**: Intl.Segmenterによる文字境界認識、結合文字・サロゲートペア安全対応
- **多言語対応テキスト処理**: 絵文字・合字・アクセント記号での文字化け防止
- **HTML仕様準拠**: `<base href>`タグによる相対URL解決、document.baseURI優先使用
- **外部API制御**: ユーザーID + IPベースのレート制限、詳細ログ・サマリー集計による運用監視
- **デバッグ容易**: Node.jsランタイムで完全なログとエラー情報
- **メンテナンス性**: 一般的なライブラリによる実装で保守が容易