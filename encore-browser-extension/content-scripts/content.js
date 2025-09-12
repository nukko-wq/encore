/**
 * コンテンツスクリプト
 * Webページから情報を抽出し、バックグラウンドスクリプトと連携
 */

/**
 * ページ情報を抽出
 */
function extractPageInfo() {
  const pageInfo = {
    url: window.location.href,
    title: document.title,
    description: '',
    thumbnail: '',
    favicon: '',
    siteName: '',
    author: '',
    publishedTime: '',
    modifiedTime: '',
    tags: [],
    language: document.documentElement.lang || 'ja',
  }

  // メタタグから情報を抽出
  const metaTags = document.querySelectorAll('meta')
  metaTags.forEach((tag) => {
    const property = tag.getAttribute('property') || tag.getAttribute('name')
    const content = tag.getAttribute('content')

    if (!property || !content) return

    switch (property.toLowerCase()) {
      // 説明文
      case 'description':
      case 'og:description':
      case 'twitter:description':
        if (!pageInfo.description) {
          pageInfo.description = content.trim()
        }
        break

      // 画像/サムネイル
      case 'og:image':
      case 'og:image:url':
      case 'twitter:image':
      case 'twitter:image:src':
        if (!pageInfo.thumbnail) {
          pageInfo.thumbnail = resolveUrl(content)
        }
        break

      // タイトル
      case 'og:title':
      case 'twitter:title':
        if (content !== document.title && !pageInfo.title.includes(content)) {
          pageInfo.title = content.trim()
        }
        break

      // サイト名
      case 'og:site_name':
      case 'twitter:site':
        if (!pageInfo.siteName) {
          pageInfo.siteName = content.trim()
        }
        break

      // 作者
      case 'author':
      case 'article:author':
        if (!pageInfo.author) {
          pageInfo.author = content.trim()
        }
        break

      // 公開日時
      case 'article:published_time':
      case 'article:published':
      case 'datepublished':
        if (!pageInfo.publishedTime) {
          pageInfo.publishedTime = content.trim()
        }
        break

      // 更新日時
      case 'article:modified_time':
      case 'article:modified':
      case 'datemodified':
        if (!pageInfo.modifiedTime) {
          pageInfo.modifiedTime = content.trim()
        }
        break

      // キーワード・タグ
      case 'keywords':
        if (content) {
          const keywords = content
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k)
          pageInfo.tags = [...pageInfo.tags, ...keywords]
        }
        break

      case 'article:tag':
        if (content) {
          pageInfo.tags.push(content.trim())
        }
        break
    }
  })

  // ファビコンを取得
  pageInfo.favicon = extractFavicon()

  // JSON-LDからの情報抽出
  extractJsonLd(pageInfo)

  // 構造化データからの情報抽出
  extractStructuredData(pageInfo)

  // タグの重複を削除
  pageInfo.tags = [...new Set(pageInfo.tags)]

  return pageInfo
}

/**
 * 相対URLを絶対URLに変換
 */
function resolveUrl(url) {
  if (!url) return ''

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }

    if (url.startsWith('//')) {
      return window.location.protocol + url
    }

    if (url.startsWith('/')) {
      return window.location.origin + url
    }

    // 相対パス
    const base = window.location.href.substring(
      0,
      window.location.href.lastIndexOf('/') + 1,
    )
    return new URL(url, base).href
  } catch (error) {
    console.warn('Failed to resolve URL:', url, error)
    return ''
  }
}

/**
 * ファビコンを抽出
 */
function extractFavicon() {
  // link rel="icon" を探す
  const iconLink = document.querySelector(
    'link[rel*="icon"]:not([rel*="apple"])',
  )
  if (iconLink?.href) {
    return iconLink.href
  }

  // apple-touch-icon
  const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]')
  if (appleTouchIcon?.href) {
    return appleTouchIcon.href
  }

  // デフォルトのfavicon.ico
  return `${window.location.origin}/favicon.ico`
}

/**
 * JSON-LD構造化データから情報を抽出
 */
function extractJsonLd(pageInfo) {
  try {
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    )

    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent)

        // 配列の場合は最初の要素を使用
        const jsonData = Array.isArray(data) ? data[0] : data

        if (!jsonData || typeof jsonData !== 'object') return

        // Article, BlogPosting, NewsArticle など
        if (
          ['Article', 'BlogPosting', 'NewsArticle', 'WebPage'].includes(
            jsonData['@type'],
          )
        ) {
          if (
            jsonData.headline &&
            !pageInfo.title.includes(jsonData.headline)
          ) {
            pageInfo.title = jsonData.headline
          }

          if (jsonData.description && !pageInfo.description) {
            pageInfo.description = jsonData.description
          }

          if (jsonData.image) {
            const imageUrl = Array.isArray(jsonData.image)
              ? jsonData.image[0]
              : jsonData.image
            const finalImageUrl =
              typeof imageUrl === 'string' ? imageUrl : imageUrl?.url
            if (finalImageUrl && !pageInfo.thumbnail) {
              pageInfo.thumbnail = resolveUrl(finalImageUrl)
            }
          }

          if (jsonData.author) {
            const author = Array.isArray(jsonData.author)
              ? jsonData.author[0]
              : jsonData.author
            const authorName =
              typeof author === 'string' ? author : author?.name
            if (authorName && !pageInfo.author) {
              pageInfo.author = authorName
            }
          }

          if (jsonData.datePublished && !pageInfo.publishedTime) {
            pageInfo.publishedTime = jsonData.datePublished
          }

          if (jsonData.dateModified && !pageInfo.modifiedTime) {
            pageInfo.modifiedTime = jsonData.dateModified
          }

          if (jsonData.keywords) {
            const keywords = Array.isArray(jsonData.keywords)
              ? jsonData.keywords
              : [jsonData.keywords]
            pageInfo.tags = [...pageInfo.tags, ...keywords]
          }
        }

        // Organization
        if (
          jsonData['@type'] === 'Organization' &&
          jsonData.name &&
          !pageInfo.siteName
        ) {
          pageInfo.siteName = jsonData.name
        }
      } catch (parseError) {
        console.warn('Failed to parse JSON-LD:', parseError)
      }
    })
  } catch (error) {
    console.warn('JSON-LD extraction failed:', error)
  }
}

/**
 * その他の構造化データから情報を抽出
 */
function extractStructuredData(pageInfo) {
  // h1タグからタイトル候補を取得
  if (!pageInfo.title || pageInfo.title === document.title) {
    const h1 = document.querySelector('h1')
    if (h1?.textContent.trim()) {
      pageInfo.title = h1.textContent.trim()
    }
  }

  // 最初の段落から説明文を取得（メタ説明がない場合）
  if (!pageInfo.description) {
    const paragraph = document.querySelector('article p, main p, .content p, p')
    if (paragraph && paragraph.textContent.trim().length > 50) {
      pageInfo.description = paragraph.textContent.trim().substring(0, 300)
    }
  }

  // 最初の画像を取得（OG画像がない場合）
  if (!pageInfo.thumbnail) {
    const img = document.querySelector(
      'article img, main img, .content img, img',
    )
    if (img?.src && img.naturalWidth > 200 && img.naturalHeight > 100) {
      pageInfo.thumbnail = img.src
    }
  }
}

/**
 * バックグラウンドスクリプトからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('Content script received message:', request)

  try {
    switch (request.type) {
      case 'EXTRACT_PAGE_INFO': {
        const pageInfo = extractPageInfo()
        sendResponse({ success: true, data: pageInfo })
        break
      }

      case 'GET_SELECTED_TEXT': {
        const selection = window.getSelection()
        const selectedText = selection ? selection.toString().trim() : ''
        sendResponse({ success: true, data: { selectedText } })
        break
      }

      case 'GET_LINK_INFO': {
        const linkInfo = getLinkInfo(request.selector)
        sendResponse({ success: true, data: linkInfo })
        break
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('Content script error:', error)
    sendResponse({ success: false, error: error.message })
  }

  // 非同期レスポンスを示すためにtrueを返す
  return true
})

/**
 * リンク情報を取得
 */
function getLinkInfo(selector) {
  try {
    const element = selector ? document.querySelector(selector) : null

    if (element && element.tagName === 'A') {
      return {
        url: element.href,
        text: element.textContent.trim(),
        title: element.getAttribute('title') || '',
      }
    }

    return null
  } catch (error) {
    console.warn('Failed to get link info:', error)
    return null
  }
}

/**
 * ページロード時の自動処理
 */
function onPageLoad() {
  // ページ情報を抽出してバックグラウンドに送信（必要に応じて）
  if (document.readyState === 'complete') {
    console.log('Content script loaded on:', window.location.href)
  }
}

// ページロード完了時に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onPageLoad)
} else {
  onPageLoad()
}

// ウィンドウロード完了時にも実行
if (document.readyState !== 'complete') {
  window.addEventListener('load', onPageLoad)
}

console.log('Content script initialized')
