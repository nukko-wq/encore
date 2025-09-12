/**
 * サービスワーカー (Background Script)
 * Chrome拡張機能のバックグラウンド処理を担当
 */

import { BookmarkAPI } from '../shared/api.js'
import { AuthUtils, initializeAuth } from '../shared/auth.js'

/**
 * 拡張機能のインストール時の処理
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('🚀 Extension installed:', details.reason)
  console.log('Extension version:', chrome.runtime.getManifest().version)
  console.log('Available APIs:', {
    contextMenus: !!chrome.contextMenus,
    cookies: !!chrome.cookies,
    storage: !!chrome.storage,
    tabs: !!chrome.tabs,
  })

  try {
    // 認証を初期化
    console.log('Initializing authentication...')
    await initializeAuth()

    // コンテキストメニューを作成
    console.log('Setting up context menus...')
    await setupContextMenus()

    console.log('✅ Extension setup completed successfully')
  } catch (error) {
    console.error('💥 Extension setup failed:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
  }
})

/**
 * 拡張機能の起動時の処理
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started')

  try {
    // 認証を初期化
    await initializeAuth()
  } catch (error) {
    console.error('Extension startup failed:', error)
  }
})

/**
 * ショートカットキーコマンドの処理
 */
chrome.commands.onCommand.addListener(async (command, tab) => {
  console.log('Command received:', command, tab?.url)

  if (command === 'save-bookmark' && tab) {
    await handleQuickSaveBookmark(tab)
  }
})

/**
 * コンテキストメニューのセットアップ
 */
async function setupContextMenus() {
  try {
    // contextMenus API の利用可能性をチェック
    if (!chrome.contextMenus) {
      console.warn('ContextMenus API is not available')
      return
    }

    // 既存のメニューをクリア
    await chrome.contextMenus.removeAll()

    // ページ保存メニュー
    chrome.contextMenus.create({
      id: 'save-page',
      title: 'このページをEncoreに保存',
      contexts: ['page'],
    })

    // リンク保存メニュー
    chrome.contextMenus.create({
      id: 'save-link',
      title: 'このリンクをEncoreに保存',
      contexts: ['link'],
    })

    console.log('Context menus created successfully')
  } catch (error) {
    console.error('Failed to setup context menus:', error)
    // コンテキストメニューの作成に失敗しても拡張機能は動作するようにする
  }
}

/**
 * コンテキストメニューのクリック処理
 */
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('Context menu clicked:', info.menuItemId, info)

    try {
      switch (info.menuItemId) {
        case 'save-page':
          if (tab) {
            await handleQuickSaveBookmark(tab)
          }
          break

        case 'save-link':
          if (info.linkUrl && tab) {
            await handleQuickSaveLinkBookmark(info.linkUrl, tab)
          }
          break
      }
    } catch (error) {
      console.error('Context menu action failed:', error)
      await showNotification('保存に失敗しました', 'error')
    }
  })
} else {
  console.warn('ContextMenus API is not available for event listeners')
}

/**
 * 現在のページをクイック保存
 */
async function handleQuickSaveBookmark(tab) {
  try {
    // 認証チェック
    const user = await AuthUtils.requireAuth()
    if (!user) {
      await showNotification('ログインが必要です', 'error')
      return
    }

    // 通知を表示
    await showNotification('ブックマークを保存中...', 'info')

    // ブックマークデータを構築
    const bookmarkData = {
      url: tab.url,
      title: tab.title,
      description: '', // TODO: メタデータから取得
      memo: '',
      tagIds: [],
    }

    // ブックマークを保存
    await BookmarkAPI.createBookmark(bookmarkData)

    // 成功通知
    await showNotification('ブックマークを保存しました', 'success')
  } catch (error) {
    console.error('Quick save failed:', error)

    if (AuthUtils.isAuthError(error)) {
      await showNotification('ログインが必要です', 'error')
    } else {
      await showNotification('保存に失敗しました', 'error')
    }
  }
}

/**
 * リンクをクイック保存
 */
async function handleQuickSaveLinkBookmark(linkUrl, tab) {
  try {
    // 認証チェック
    const user = await AuthUtils.requireAuth()
    if (!user) {
      await showNotification('ログインが必要です', 'error')
      return
    }

    // 通知を表示
    await showNotification('リンクを保存中...', 'info')

    // リンク情報を取得
    let linkTitle = linkUrl
    try {
      // コンテンツスクリプトからリンクのテキストを取得
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (url) => {
          const link = document.querySelector(`a[href="${url}"]`)
          return link ? link.textContent.trim() : ''
        },
        args: [linkUrl],
      })

      if (results?.[0]?.result) {
        linkTitle = results[0].result
      }
    } catch (scriptError) {
      console.warn('Failed to get link text:', scriptError)
    }

    // ブックマークデータを構築
    const bookmarkData = {
      url: linkUrl,
      title: linkTitle,
      description: `${tab.title} からのリンク`,
      memo: '',
      tagIds: [],
    }

    // ブックマークを保存
    await BookmarkAPI.createBookmark(bookmarkData)

    // 成功通知
    await showNotification('リンクを保存しました', 'success')
  } catch (error) {
    console.error('Link save failed:', error)

    if (AuthUtils.isAuthError(error)) {
      await showNotification('ログインが必要です', 'error')
    } else {
      await showNotification('保存に失敗しました', 'error')
    }
  }
}

/**
 * 通知を表示
 */
async function showNotification(message, type = 'info') {
  try {
    const iconMap = {
      success: 'assets/icons/icon-48.svg',
      error: 'assets/icons/icon-48.svg',
      info: 'assets/icons/icon-48.svg',
    }

    const titleMap = {
      success: 'Encore Bookmark',
      error: 'Encore Bookmark - エラー',
      info: 'Encore Bookmark',
    }

    await chrome.notifications.create({
      type: 'basic',
      iconUrl: iconMap[type] || iconMap.info,
      title: titleMap[type] || titleMap.info,
      message: message,
    })
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

/**
 * ポップアップからのメッセージ処理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request)

  // 非同期処理の場合はtrueを返す
  switch (request.type) {
    case 'GET_TAB_INFO':
      handleGetTabInfo(request, sender, sendResponse)
      return true

    case 'EXTRACT_METADATA':
      handleExtractMetadata(request, sender, sendResponse)
      return true

    case 'SHOW_NOTIFICATION':
      showNotification(request.message, request.notificationType)
      sendResponse({ success: true })
      return false

    default:
      sendResponse({ error: 'Unknown message type' })
      return false
  }
})

/**
 * タブ情報取得の処理
 */
async function handleGetTabInfo(_request, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (tab) {
      sendResponse({
        success: true,
        data: {
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
        },
      })
    } else {
      sendResponse({ success: false, error: 'Active tab not found' })
    }
  } catch (error) {
    console.error('Failed to get tab info:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * メタデータ抽出の処理
 */
async function handleExtractMetadata(request, _sender, sendResponse) {
  try {
    const { tabId } = request

    // コンテンツスクリプトでメタデータを抽出
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: extractPageMetadata,
    })

    if (results?.[0]?.result) {
      sendResponse({ success: true, data: results[0].result })
    } else {
      sendResponse({ success: false, error: 'Failed to extract metadata' })
    }
  } catch (error) {
    console.error('Metadata extraction failed:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * ページメタデータ抽出関数（コンテンツスクリプト内で実行）
 */
function extractPageMetadata() {
  const metadata = {
    title: document.title,
    description: '',
    image: '',
    url: window.location.href,
  }

  // メタタグから情報を抽出
  const metaTags = document.querySelectorAll('meta')
  metaTags.forEach((tag) => {
    const property = tag.getAttribute('property') || tag.getAttribute('name')
    const content = tag.getAttribute('content')

    if (!property || !content) return

    switch (property.toLowerCase()) {
      case 'og:description':
      case 'description':
        if (!metadata.description) {
          metadata.description = content
        }
        break

      case 'og:image':
      case 'twitter:image':
        if (!metadata.image) {
          metadata.image = content
        }
        break

      case 'og:title':
        if (content !== document.title) {
          metadata.title = content
        }
        break
    }
  })

  // 画像URLを絶対URLに変換
  if (metadata.image && !metadata.image.startsWith('http')) {
    try {
      const url = new URL(metadata.image, window.location.origin)
      metadata.image = url.href
    } catch (error) {
      console.warn('Failed to convert image URL:', error)
      metadata.image = ''
    }
  }

  return metadata
}

/**
 * 拡張機能のアンインストール時の処理
 */
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending')
  // 必要に応じてクリーンアップ処理を追加
})

console.log('Service worker loaded')
