/**
 * ポップアップのメインロジック
 * UI状態管理とユーザーインタラクションを担当
 */

import { ApiUtils, BookmarkAPI, TagAPI } from '../shared/api.js'
import {
  AuthStatus,
  AuthUtils,
  initializeAuth,
  onAuthStateChange,
} from '../shared/auth.js'

/**
 * アプリケーション状態
 */
const AppState = {
  LOADING: 'loading',
  LOGIN_REQUIRED: 'login-required',
  BOOKMARK_FORM: 'bookmark-form',
  SAVING: 'saving',
  SUCCESS: 'success',
  ERROR: 'error',
}

/**
 * ポップアップアプリケーションクラス
 */
class PopupApp {
  constructor() {
    this.currentState = AppState.LOADING
    this.currentTab = null
    this.availableTags = []
    this.selectedTagIds = new Set()
    this.authManager = null
    this.searchQuery = ''
    this.selectedSuggestionIndex = -1

    // DOM要素の参照を保持
    this.elements = {}

    // バインドされたメソッド
    this.onAuthStateChange = this.onAuthStateChange.bind(this)
    this.handleSaveBookmark = this.handleSaveBookmark.bind(this)
    this.handleLogin = this.handleLogin.bind(this)
    this.handleRetry = this.handleRetry.bind(this)
    this.handleTagClick = this.handleTagClick.bind(this)
    this.handleTagSearch = this.handleTagSearch.bind(this)
    this.handleTagSearchKeydown = this.handleTagSearchKeydown.bind(this)
    this.handleTagSuggestionClick = this.handleTagSuggestionClick.bind(this)
    this.handleSearchClear = this.handleSearchClear.bind(this)
    this.handleCreateNewTag = this.handleCreateNewTag.bind(this)
    this.handleViewBookmarks = this.handleViewBookmarks.bind(this)
  }

  /**
   * アプリケーションを初期化
   */
  async initialize() {
    try {
      // DOM要素の参照を取得
      this.initializeDOMReferences()

      // イベントリスナーを設定
      this.setupEventListeners()

      // 現在のタブ情報を取得
      await this.getCurrentTab()

      // 認証を初期化
      this.authManager = await initializeAuth()

      // 認証状態の変更を監視
      onAuthStateChange(this.onAuthStateChange)
    } catch (error) {
      console.error('Popup initialization error:', error)
      this.showError('初期化に失敗しました')
    }
  }

  /**
   * DOM要素の参照を初期化
   */
  initializeDOMReferences() {
    this.elements = {
      // 状態コンテナ
      loadingState: document.getElementById('loading-state'),
      loginRequiredState: document.getElementById('login-required-state'),
      bookmarkFormState: document.getElementById('bookmark-form-state'),
      savingState: document.getElementById('saving-state'),
      successState: document.getElementById('success-state'),
      errorState: document.getElementById('error-state'),

      // ページ情報
      pageThumbnail: document.getElementById('page-thumbnail'),
      pageTitle: document.getElementById('page-title'),
      pageUrl: document.getElementById('page-url'),

      // フォーム要素
      selectedTags: document.getElementById('selected-tags'),
      tagSearchInput: document.getElementById('tag-search-input'),
      tagSuggestions: document.getElementById('tag-suggestions'),
      searchClear: document.getElementById('search-clear'),
      matchingTags: document.getElementById('matching-tags'),
      frequentTags: document.getElementById('frequent-tags'),
      createNewTag: document.getElementById('create-new-tag'),
      createTagName: document.getElementById('create-tag-name'),

      // ボタン
      loginButton: document.getElementById('login-button'),
      saveButton: document.getElementById('save-button'),
      retryButton: document.getElementById('retry-button'),
      viewBookmarksButton: document.getElementById('view-bookmarks-button'),

      // エラー表示
      errorMessage: document.getElementById('error-message'),
    }
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // ボタンイベント
    this.elements.loginButton?.addEventListener('click', this.handleLogin)
    this.elements.saveButton?.addEventListener('click', this.handleSaveBookmark)
    this.elements.retryButton?.addEventListener('click', this.handleRetry)
    this.elements.viewBookmarksButton?.addEventListener(
      'click',
      this.handleViewBookmarks,
    )

    // タグ検索関連のイベントリスナー
    this.elements.tagSearchInput?.addEventListener(
      'input',
      this.handleTagSearch,
    )
    this.elements.tagSearchInput?.addEventListener(
      'keydown',
      this.handleTagSearchKeydown,
    )
    this.elements.tagSearchInput?.addEventListener('focus', () => {
      this.showTagSuggestions()
    })
    this.elements.searchClear?.addEventListener('click', this.handleSearchClear)

    // ドキュメントクリックで候補を閉じる
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tag-search-container')) {
        this.hideTagSuggestions()
      }
    })
  }

  /**
   * 現在のタブ情報を取得
   */
  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      this.currentTab = tab

      if (this.currentTab) {
        console.log('Current tab:', this.currentTab.url)
      }
    } catch (error) {
      console.error('Failed to get current tab:', error)
    }
  }

  /**
   * 認証状態変更のハンドラ
   */
  onAuthStateChange(authState) {
    console.log('Auth state changed:', authState.status)

    switch (authState.status) {
      case AuthStatus.LOADING:
        this.setState(AppState.LOADING)
        break

      case AuthStatus.AUTHENTICATED:
        this.initializeBookmarkForm()
        break

      case AuthStatus.UNAUTHENTICATED:
        this.setState(AppState.LOGIN_REQUIRED)
        break

      case AuthStatus.ERROR:
        this.showError('認証エラーが発生しました')
        break
    }
  }

  /**
   * ブックマークフォームを初期化
   */
  async initializeBookmarkForm() {
    try {
      // ページ情報を表示
      this.displayPageInfo()

      // タグ一覧を読み込み
      await this.loadTags()

      // 新規作成ハンドラーを設定
      this.setupCreateNewTagHandler()

      // フォーム状態に切り替え
      this.setState(AppState.BOOKMARK_FORM)
    } catch (error) {
      console.error('Failed to initialize bookmark form:', error)
      this.showError('フォームの初期化に失敗しました')
    }
  }

  /**
   * ページ情報を表示
   */
  displayPageInfo() {
    if (!this.currentTab) return

    // タイトルを設定
    const title = this.currentTab.title || 'タイトルなし'
    this.elements.pageTitle.textContent = title

    // URLを設定
    this.elements.pageUrl.textContent = this.currentTab.url

    // ファビコンの処理
    console.log('Favicon URL:', this.currentTab.favIconUrl)

    if (this.currentTab.favIconUrl) {
      console.log('Favicon found, setting as background...')

      // 背景画像としてファビコンを設定
      this.elements.pageThumbnail.style.backgroundImage = `url('${this.currentTab.favIconUrl}')`
      this.elements.pageThumbnail.classList.add('has-favicon')

      // 画像読み込みエラーの検証用（オプション）
      const testImg = new Image()
      testImg.onload = () => {
        console.log('Favicon loaded successfully')
      }
      testImg.onerror = () => {
        console.log('Favicon failed to load, falling back to placeholder')
        this.elements.pageThumbnail.style.backgroundImage = ''
        this.elements.pageThumbnail.classList.remove('has-favicon')
      }
      testImg.src = this.currentTab.favIconUrl
    } else {
      console.log('No favicon available, showing placeholder')
      // ファビコンがない場合はプレースホルダーを表示（デフォルト状態）
      this.elements.pageThumbnail.style.backgroundImage = ''
      this.elements.pageThumbnail.classList.remove('has-favicon')
    }
  }

  /**
   * タグ一覧を読み込み
   */
  async loadTags() {
    try {
      const response = await TagAPI.getTags()
      this.availableTags = Array.isArray(response.data)
        ? response.data
        : response || []
      this.renderAvailableTags()
    } catch (error) {
      console.warn('Failed to load tags:', error)
      this.availableTags = []
    }
  }

  /**
   * タグ候補を表示
   */
  showTagSuggestions() {
    if (!this.elements.tagSuggestions) return

    this.updateTagSuggestions()
    this.elements.tagSuggestions.classList.remove('hidden')
  }

  /**
   * タグ候補を非表示
   */
  hideTagSuggestions() {
    if (!this.elements.tagSuggestions) return

    this.elements.tagSuggestions.classList.add('hidden')
    this.selectedSuggestionIndex = -1
  }

  /**
   * タグ候補を更新
   */
  updateTagSuggestions() {
    const query = this.searchQuery.toLowerCase().trim()

    // 検索結果をフィルタリング
    const matchingTags = this.availableTags.filter(
      (tag) =>
        !this.selectedTagIds.has(tag.id) &&
        tag.name.toLowerCase().includes(query),
    )

    // よく使用するタグ（使用頻度でソート、最大5件）
    const frequentTags = this.availableTags
      .filter(
        (tag) =>
          !this.selectedTagIds.has(tag.id) && !matchingTags.includes(tag),
      )
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, 5)

    // 検索結果セクション
    if (matchingTags.length > 0) {
      this.elements.matchingTags.style.display = 'block'
      this.renderSuggestionList(
        this.elements.matchingTags.querySelector('.suggestion-list'),
        matchingTags,
      )
    } else {
      this.elements.matchingTags.style.display = 'none'
    }

    // よく使用するタグセクション
    if (frequentTags.length > 0 && query === '') {
      this.elements.frequentTags.style.display = 'block'
      this.renderSuggestionList(
        this.elements.frequentTags.querySelector('.suggestion-list'),
        frequentTags,
      )
    } else {
      this.elements.frequentTags.style.display = 'none'
    }

    // 新規作成セクション
    const hasExactMatch = this.availableTags.some(
      (tag) => tag.name.toLowerCase() === query,
    )

    if (query && !hasExactMatch) {
      this.elements.createNewTag.classList.remove('hidden')
      this.elements.createTagName.textContent = query
    } else {
      this.elements.createNewTag.classList.add('hidden')
    }
  }

  /**
   * 候補リストをレンダリング
   */
  renderSuggestionList(container, tags) {
    if (!container) return

    container.innerHTML = ''

    tags.forEach((tag, index) => {
      const tagElement = this.createSuggestionTagElement(tag)
      container.appendChild(tagElement)
    })
  }

  /**
   * 選択済みタグを表示
   */
  renderSelectedTags() {
    if (!this.elements.selectedTags) return

    this.elements.selectedTags.innerHTML = ''

    this.selectedTagIds.forEach((tagId) => {
      const tag = this.availableTags.find((t) => t.id === tagId)
      if (tag) {
        const tagElement = this.createSelectedTagElement(tag)
        this.elements.selectedTags.appendChild(tagElement)
      }
    })
  }

  /**
   * 候補タグ要素を作成
   */
  createSuggestionTagElement(tag) {
    const tagEl = document.createElement('div')
    tagEl.className = 'suggestion-item tag-suggestion'
    tagEl.dataset.tagId = tag.id
    tagEl.addEventListener('click', () => this.handleTagSuggestionClick(tag))

    // タグの色
    if (tag.color) {
      const colorEl = document.createElement('div')
      colorEl.className = 'tag-color'
      colorEl.style.backgroundColor = tag.color
      tagEl.appendChild(colorEl)
    }

    // タグ名
    const nameEl = document.createElement('span')
    nameEl.textContent = tag.name
    tagEl.appendChild(nameEl)

    // 使用回数表示（オプション）
    if (tag.usage_count > 0) {
      const countEl = document.createElement('span')
      countEl.className = 'tag-count'
      countEl.textContent = tag.usage_count
      tagEl.appendChild(countEl)
    }

    return tagEl
  }

  /**
   * 選択済みタグ要素を作成
   */
  createSelectedTagElement(tag) {
    const tagEl = document.createElement('div')
    tagEl.className = 'tag tag-selected'
    tagEl.dataset.tagId = tag.id

    // タグの色
    if (tag.color) {
      const colorEl = document.createElement('div')
      colorEl.className = 'tag-color'
      colorEl.style.backgroundColor = tag.color
      tagEl.appendChild(colorEl)
    }

    // タグ名
    const nameEl = document.createElement('span')
    nameEl.textContent = tag.name
    tagEl.appendChild(nameEl)

    // 削除ボタン
    const removeEl = document.createElement('svg')
    removeEl.className = 'tag-remove'
    removeEl.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    `
    removeEl.setAttribute('viewBox', '0 0 24 24')
    removeEl.setAttribute('fill', 'none')
    removeEl.setAttribute('stroke', 'currentColor')
    removeEl.addEventListener('click', (e) => {
      e.stopPropagation()
      this.handleTagClick(tag.id)
    })
    tagEl.appendChild(removeEl)

    return tagEl
  }

  /**
   * タグクリックのハンドラ（選択済みタグの削除）
   */
  handleTagClick(tagId) {
    if (this.selectedTagIds.has(tagId)) {
      this.selectedTagIds.delete(tagId)
      this.renderSelectedTags()
      this.updateTagSuggestions()
    }
  }

  /**
   * タグ検索のハンドラ
   */
  handleTagSearch(e) {
    this.searchQuery = e.target.value

    // クリアボタンの表示切り替え
    if (this.searchQuery) {
      this.elements.searchClear?.classList.remove('hidden')
    } else {
      this.elements.searchClear?.classList.add('hidden')
    }

    this.showTagSuggestions()
  }

  /**
   * タグ検索キーダウンのハンドラ
   */
  handleTagSearchKeydown(e) {
    const suggestions =
      this.elements.tagSuggestions?.querySelectorAll('.suggestion-item')

    if (!suggestions) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        this.selectedSuggestionIndex = Math.min(
          this.selectedSuggestionIndex + 1,
          suggestions.length - 1,
        )
        this.highlightSuggestion(suggestions)
        break

      case 'ArrowUp':
        e.preventDefault()
        this.selectedSuggestionIndex = Math.max(
          this.selectedSuggestionIndex - 1,
          -1,
        )
        this.highlightSuggestion(suggestions)
        break

      case 'Enter':
        e.preventDefault()
        if (
          this.selectedSuggestionIndex >= 0 &&
          suggestions[this.selectedSuggestionIndex]
        ) {
          suggestions[this.selectedSuggestionIndex].click()
        } else if (this.searchQuery.trim()) {
          // 新規タグ作成
          this.handleCreateNewTag()
        }
        break

      case 'Escape':
        this.hideTagSuggestions()
        this.elements.tagSearchInput?.blur()
        break
    }
  }

  /**
   * 候補のハイライト
   */
  highlightSuggestion(suggestions) {
    suggestions.forEach((item, index) => {
      if (index === this.selectedSuggestionIndex) {
        item.classList.add('highlighted')
      } else {
        item.classList.remove('highlighted')
      }
    })
  }

  /**
   * タグ候補クリックのハンドラ
   */
  handleTagSuggestionClick(tag) {
    this.selectedTagIds.add(tag.id)
    this.renderSelectedTags()

    // 検索をクリア
    this.searchQuery = ''
    this.elements.tagSearchInput.value = ''
    this.elements.searchClear?.classList.add('hidden')

    this.hideTagSuggestions()
    this.elements.tagSearchInput?.focus()
  }

  /**
   * 検索クリアのハンドラ
   */
  handleSearchClear() {
    this.searchQuery = ''
    this.elements.tagSearchInput.value = ''
    this.elements.searchClear?.classList.add('hidden')
    this.updateTagSuggestions()
    this.elements.tagSearchInput?.focus()
  }

  /**
   * 新規タグ作成のハンドラ
   */
  async handleCreateNewTag() {
    const tagName = this.searchQuery.trim()
    if (!tagName) return

    try {
      // ランダムな色を生成
      const colors = [
        '#3B82F6',
        '#10B981',
        '#F59E0B',
        '#EF4444',
        '#8B5CF6',
        '#F97316',
      ]
      const color = colors[Math.floor(Math.random() * colors.length)]

      const newTag = await TagAPI.createTag({
        name: tagName,
        color: color,
      })

      // タグリストに追加
      this.availableTags.push(newTag)

      // 自動的に選択
      this.selectedTagIds.add(newTag.id)

      // UIを更新
      this.renderSelectedTags()

      // 検索をクリア
      this.searchQuery = ''
      this.elements.tagSearchInput.value = ''
      this.elements.searchClear?.classList.add('hidden')

      this.hideTagSuggestions()
      this.elements.tagSearchInput?.focus()
    } catch (error) {
      console.error('Failed to create tag:', {
        error: error,
        message: error.message,
        status: error.status,
        tagName: tagName,
      })

      // より詳細なエラーメッセージを表示
      let errorMessage = ApiUtils.getErrorMessage(error)
      if (error.status) {
        errorMessage += ` (Status: ${error.status})`
      }

      alert(`タグの作成に失敗しました: ${errorMessage}`)
    }
  }

  /**
   * セットアップ後の初期化処理
   */
  setupCreateNewTagHandler() {
    // 新規作成セクションのクリックハンドラー
    this.elements.createNewTag?.addEventListener('click', () => {
      this.handleCreateNewTag()
    })
  }

  /**
   * ブックマーク保存のハンドラ
   */
  async handleSaveBookmark() {
    if (!this.currentTab) {
      this.showError('現在のページ情報を取得できません')
      return
    }

    try {
      this.setState(AppState.SAVING)

      // ブックマークデータを構築
      const bookmarkData = {
        url: this.currentTab.url,
        title: this.currentTab.title,
        description: '', // TODO: メタデータから取得
        memo: '',
        tagIds: Array.from(this.selectedTagIds),
      }

      // ブックマークを作成
      await BookmarkAPI.createBookmark(bookmarkData)

      this.setState(AppState.SUCCESS)
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      this.showError(AuthUtils.getUserFriendlyError(error))
    }
  }

  /**
   * ログインのハンドラ
   */
  async handleLogin() {
    try {
      await this.authManager.login()
    } catch (error) {
      console.error('Login failed:', error)
      this.showError('ログインに失敗しました')
    }
  }

  /**
   * リトライのハンドラ
   */
  handleRetry() {
    if (this.authManager?.isAuthenticated()) {
      this.initializeBookmarkForm()
    } else {
      this.setState(AppState.LOGIN_REQUIRED)
    }
  }

  /**
   * ブックマーク一覧表示のハンドラ
   */
  async handleViewBookmarks() {
    try {
      const bookmarksUrl = `${window.location.protocol}//${window.location.hostname}:3002/bookmarks`
      await chrome.tabs.create({ url: bookmarksUrl })
      window.close()
    } catch (error) {
      console.error('Failed to open bookmarks:', error)
    }
  }

  /**
   * アプリケーション状態を変更
   */
  setState(newState) {
    console.log('State change:', this.currentState, '->', newState)
    this.currentState = newState

    // すべての状態を非表示
    Object.values(this.elements).forEach((el) => {
      if (el?.classList?.contains('state-container')) {
        el.classList.add('hidden')
      }
    })

    // 対応する状態を表示
    const stateMapping = {
      [AppState.LOADING]: this.elements.loadingState,
      [AppState.LOGIN_REQUIRED]: this.elements.loginRequiredState,
      [AppState.BOOKMARK_FORM]: this.elements.bookmarkFormState,
      [AppState.SAVING]: this.elements.savingState,
      [AppState.SUCCESS]: this.elements.successState,
      [AppState.ERROR]: this.elements.errorState,
    }

    const targetElement = stateMapping[newState]
    if (targetElement) {
      targetElement.classList.remove('hidden')
    }
  }

  /**
   * エラー状態を表示
   */
  showError(message) {
    console.error('Showing error:', message)

    if (this.elements.errorMessage) {
      this.elements.errorMessage.textContent = message
    }

    this.setState(AppState.ERROR)
  }
}

/**
 * ポップアップアプリケーションのインスタンス
 */
let popupApp = null

/**
 * DOMContentLoaded時にアプリケーションを初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    popupApp = new PopupApp()
    await popupApp.initialize()
  } catch (error) {
    console.error('Failed to initialize popup:', error)
  }
})

/**
 * ウィンドウクローズ時のクリーンアップ
 */
window.addEventListener('beforeunload', () => {
  if (popupApp) {
    // 必要に応じてクリーンアップ処理を追加
  }
})
