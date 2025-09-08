/**
 * メタデータ抽出モジュール（共有ロジック）
 * API RouteとBookmarkServiceから使用
 */

import { Readability } from '@mozilla/readability'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import {
  safeFetch,
  safeTextTrim,
  validateUrlForFetch,
} from '@/lib/security/fetch-guard'
import { makeAbsoluteUrl } from '@/lib/url-normalization'

export interface ExtractedMetadata {
  title: string
  description: string
  image: string
  favicon: string
  siteName: string
  url: string
}

/**
 * URLからHTMLメタデータを抽出
 */
export async function extractMetadataFromHtml(
  url: string,
): Promise<ExtractedMetadata> {
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

  return {
    title: title || 'Untitled',
    description: extractedDescription || '',
    image: absoluteImage,
    favicon: absoluteFavicon,
    siteName,
    url,
  }
}

/**
 * 高品質画像選択（HTTPS優先、解像度優先）
 * OGP複数対応、Twitter別名義、レガシー候補、サイズ推定、SVG/ロゴ減点を含む改良版
 */
function selectBestImage($: cheerio.CheerioAPI, baseUrl: string): string {
  type Cand = {
    url: string
    width?: number
    height?: number
    priority: number
    isSecure: boolean
    penalty?: number
  }
  const c: Cand[] = []
  const push = (
    url?: string | null,
    priority = 50,
    width?: number,
    height?: number,
  ) => {
    if (!url) return
    c.push({
      url,
      width,
      height,
      priority,
      isSecure: url.startsWith('https:'),
      penalty: 0,
    })
  }

  // サイズ推定（ファイル名やクエリから）
  const inferSize = (u?: string) => {
    if (!u)
      return {
        w: undefined as number | undefined,
        h: undefined as number | undefined,
      }
    const m = u.match(/(^|[^0-9])(\d{2,4})x(\d{2,4})([^0-9]|$)/)
    let w = m ? parseInt(m[2], 10) : undefined
    let h = m ? parseInt(m[3], 10) : undefined
    try {
      const q = new URL(u, baseUrl).searchParams
      const wStr = q.get('w') || q.get('width') || q.get('maxwidth')
      const hStr = q.get('h') || q.get('height') || q.get('maxheight')
      w = w ?? (wStr ? parseInt(wStr, 10) : undefined)
      h = h ?? (hStr ? parseInt(hStr, 10) : undefined)
    } catch {}
    return { w, h }
  }

  // --- OGP 複数対応（順序を保ってグルーピング）
  type OgGroup = {
    url?: string
    secure?: string
    width?: number
    height?: number
  }
  const groups: OgGroup[] = []
  let cur: OgGroup | null = null
  $('meta[property^="og:image"]').each((_, el) => {
    const prop = $(el).attr('property') || ''
    const content = $(el).attr('content') || ''
    if (prop === 'og:image' || prop === 'og:image:url') {
      if (cur) groups.push(cur)
      cur = { url: content }
    } else if (prop === 'og:image:secure_url') {
      cur = cur ?? {}
      cur.secure = content
    } else if (prop === 'og:image:width') {
      cur = cur ?? {}
      cur.width = parseInt(content, 10) || undefined
    } else if (prop === 'og:image:height') {
      cur = cur ?? {}
      cur.height = parseInt(content, 10) || undefined
    }
  })
  if (cur) groups.push(cur)
  groups.forEach((g) => {
    const u = g.secure || g.url
    const hint = inferSize(u)
    push(u, g.secure ? 100 : 90, g.width ?? hint.w, g.height ?? hint.h)
  })

  // --- Twitter いろいろ
  ;[
    'meta[name="twitter:image:src"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
  ].forEach((sel) => {
    $(sel).each((_, el) => {
      const u = $(el).attr('content')
      const hint = inferSize(u || undefined)
      push(u, 80, hint.w, hint.h)
    })
  })

  // --- レガシー/追加候補
  push($('link[rel="image_src"]').attr('href') || undefined, 75)
  $('meta[itemprop="image"], meta[name="thumbnail"]').each((_, el) =>
    push($(el).attr('content'), 75),
  )
  $('link[rel="preload"][as="image"]').each((_, el) =>
    push($(el).attr('href'), 70),
  )

  // --- Apple touch icon（フォールバック・既定152）
  $('link[rel~="apple-touch-icon"]').each((_, el) => {
    const href = $(el).attr('href')
    const sizes = $(el).attr('sizes')
    let size = 152
    if (sizes && sizes !== 'any') {
      const m = sizes.match(/(\d+)x(\d+)/)
      if (m) size = parseInt(m[1], 10)
    }
    push(href, 70, size, size)
  })

  // 後処理（除外・減点・ユニーク化）
  const seen = new Set<string>()
  const filtered = c
    .filter(
      (v) =>
        v.url &&
        !v.url.startsWith('data:') &&
        !v.url.startsWith('blob:') &&
        !/\.svg($|\?)/i.test(v.url), // プレビュー用はラスタ優先
    )
    .map((v) => ({
      ...v,
      penalty: /logo|sprite|placeholder/i.test(v.url) ? 5 : 0,
    }))
    .filter((v) => {
      if (seen.has(v.url)) return false
      seen.add(v.url)
      return true
    })

  // ソート：HTTPS > 優先度 > 面積 > 減点（小さいほど良い）
  filtered.sort((a, b) => {
    if (a.isSecure !== b.isSecure) return a.isSecure ? -1 : 1
    if (a.priority !== b.priority) return b.priority - a.priority
    const aArea = (a.width || 0) * (a.height || 0)
    const bArea = (b.width || 0) * (b.height || 0)
    if (aArea !== bArea) return bArea - aArea
    return (a.penalty || 0) - (b.penalty || 0)
  })

  return filtered[0]?.url || ''
}

/**
 * 高品質アイコン選択（SVG、解像度優先）
 */
function selectBestIcon($: cheerio.CheerioAPI, baseUrl: string): string {
  const candidates: Array<{
    url: string
    size: number
    priority: number
    isSecure: boolean
  }> = []

  // 1. Apple touch icon（高解像度）
  $('link[rel="apple-touch-icon"]').each((_, elem) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')

    if (href) {
      let size = 152 // Apple touch iconのデフォルトサイズ
      if (sizes) {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1], 10)
        }
      }

      candidates.push({
        url: href,
        size,
        priority: 90, // 高優先度
        isSecure: href.startsWith('https:'),
      })
    }
  })

  // 2. 通常のアイコン（サイズ指定付き）
  $('link[rel*="icon"]').each((_, elem) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')
    const type = $(elem).attr('type')

    if (href) {
      let size = 16 // デフォルトサイズ
      let priority = 70

      if (sizes && sizes !== 'any') {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1], 10)
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
        isSecure: href.startsWith('https:'),
      })
    }
  })

  // 3. フォールバック
  const urlObj = new URL(baseUrl)
  candidates.push({
    url: `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`,
    size: 16,
    priority: 10, // 最低優先度
    isSecure: urlObj.protocol === 'https:',
  })

  // 候補のフィルタリング・ソート
  const filtered = candidates
    .filter((candidate) => {
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
