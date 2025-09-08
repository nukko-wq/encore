/**
 * メインメタデータ抽出API（Node.js Runtime）
 * Cheerio + JSDOM + Readabilityによる高精度抽出
 */

// Node.js Runtimeを明示的に指定
export const runtime = 'nodejs'

import { Readability } from '@mozilla/readability'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import {
  safeFetch,
  safeTextTrim,
  validateUrlForFetch,
} from '@/lib/security/fetch-guard'
import { makeAbsoluteUrl } from '@/lib/url-normalization'
import type { MetadataExtractResult } from '@/types/database'

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

    const metadata: MetadataExtractResult = {
      success: true,
      data: {
        title: title || 'Untitled',
        description: extractedDescription || '',
        image: absoluteImage,
        favicon: absoluteFavicon,
        siteName,
        url,
      },
      source: 'node',
    }

    return Response.json(metadata)
  } catch (error) {
    const errorResult: MetadataExtractResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'node',
    }

    return Response.json(errorResult, { status: 500 })
  }
}

/**
 * 高品質画像選択（HTTPS優先、解像度優先）
 */
function selectBestImage($: cheerio.CheerioAPI, _baseUrl: string): string {
  const candidates: Array<{
    url: string
    width?: number
    height?: number
    priority: number
    isSecure: boolean
  }> = []

  // 1. OG画像（secure_url優先、サイズ情報付き）
  const ogImage = $('meta[property="og:image"]').attr('content')
  const ogImageSecure = $('meta[property="og:image:secure_url"]').attr(
    'content',
  )
  const ogImageWidth = parseInt(
    $('meta[property="og:image:width"]').attr('content') || '0',
    10,
  )
  const ogImageHeight = parseInt(
    $('meta[property="og:image:height"]').attr('content') || '0',
    10,
  )

  if (ogImageSecure) {
    candidates.push({
      url: ogImageSecure,
      width: ogImageWidth || undefined,
      height: ogImageHeight || undefined,
      priority: 100, // 最高優先度（secure + OG）
      isSecure: true,
    })
  } else if (ogImage) {
    candidates.push({
      url: ogImage,
      width: ogImageWidth || undefined,
      height: ogImageHeight || undefined,
      priority: 90, // 高優先度（OG）
      isSecure: ogImage.startsWith('https:'),
    })
  }

  // 2. Twitter画像
  const twitterImage = $('meta[name="twitter:image"]').attr('content')
  if (twitterImage) {
    candidates.push({
      url: twitterImage,
      priority: 80, // 中高優先度
      isSecure: twitterImage.startsWith('https:'),
    })
  }

  // 3. Apple touch icon（高解像度）
  $('link[rel="apple-touch-icon"]').each((_, elem) => {
    const href = $(elem).attr('href')
    const sizes = $(elem).attr('sizes')
    if (href) {
      let size = 0
      if (sizes) {
        const match = sizes.match(/(\d+)x(\d+)/)
        if (match) {
          size = parseInt(match[1], 10)
        }
      }

      candidates.push({
        url: href,
        width: size || undefined,
        height: size || undefined,
        priority: 70, // 中優先度
        isSecure: href.startsWith('https:'),
      })
    }
  })

  // 候補のフィルタリング・ソート
  const filtered = candidates
    .filter((candidate) => {
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
