# Encore - フロントエンド・状態管理

## フォルダ構成
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── page.tsx
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── bookmarks/
│   │   ├── [id]/
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── modal.tsx
│   ├── bookmarks/
│   │   ├── bookmark-card.tsx
│   │   ├── bookmark-form.tsx
│   │   └── bookmark-list.tsx
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── sidebar.tsx
│   │   └── mobile-nav.tsx
│   └── common/
├── hooks/
│   ├── use-bookmarks.ts
│   ├── use-tags.ts
│   └── use-auth.ts
└── types/
    ├── database.ts
    ├── api.ts
    ├── link-preview.ts
    └── common.ts
```

## 状態管理（限定的Realtime対応）

### useBookmarks Hook
```typescript
// hooks/use-bookmarks.ts - ブックマーク一覧ページでのみRealtime購読対応
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BookmarkService } from '@/lib/services/bookmarks'
import type { BookmarkRow } from '@/types/database'

interface UseBookmarksOptions {
  filters?: BookmarkFilters
  enableRealtime?: boolean // ブックマーク一覧ページでのみRealtimeを有効化
}

export function useBookmarks({ filters, enableRealtime = false }: UseBookmarksOptions = {}) {
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const bookmarkService = new BookmarkService()
  
  // 初回データ取得
  useEffect(() => {
    const fetchBookmarks = async () => {
      try {
        setLoading(true)
        const data = await bookmarkService.getBookmarks(filters)
        setBookmarks(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch bookmarks')
      } finally {
        setLoading(false)
      }
    }
    
    fetchBookmarks()
  }, [filters])
  
  // ブックマーク一覧ページでのみRealtime更新を有効化
  useEffect(() => {
    if (!enableRealtime) return
    
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel('bookmarks-list-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookmarks',
            filter: `user_id=eq.${user.id}` // ユーザースコープでフィルタ
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setBookmarks(prev => [payload.new as BookmarkRow, ...prev])
            } else if (payload.eventType === 'UPDATE') {
              setBookmarks(prev => prev.map(bookmark => 
                bookmark.id === payload.new.id ? payload.new as BookmarkRow : bookmark
              ))
            } else if (payload.eventType === 'DELETE') {
              setBookmarks(prev => prev.filter(bookmark => bookmark.id !== payload.old.id))
            }
          }
        )
        .subscribe()
      
      return () => {
        channel.unsubscribe()
      }
    }

    const cleanup = setupRealtime()
    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn())
    }
  }, [enableRealtime])
  
  const createBookmark = async (data: { url: string; title?: string; description?: string }) => {
    try {
      const bookmark = await bookmarkService.createBookmark(data)
      // 一覧ページ以外では手動でステート更新（Chrome拡張機能用）
      if (!enableRealtime) {
        setBookmarks(prev => [bookmark, ...prev])
      }
      return bookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bookmark')
      throw err
    }
  }
  
  const updateBookmark = async (id: string, updates: Partial<BookmarkRow>) => {
    try {
      const bookmark = await bookmarkService.updateBookmark(id, updates)
      // 一覧ページ以外では手動でステート更新
      if (!enableRealtime) {
        setBookmarks(prev => prev.map(b => b.id === id ? bookmark : b))
      }
      return bookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bookmark')
      throw err
    }
  }
  
  const deleteBookmark = async (id: string) => {
    try {
      await bookmarkService.deleteBookmark(id)
      // 一覧ページ以外では手動でステート更新
      if (!enableRealtime) {
        setBookmarks(prev => prev.filter(b => b.id !== id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark')
      throw err
    }
  }
  
  return {
    bookmarks,
    loading,
    error,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    refetch: () => {
      // 手動リフレッシュが必要な場合
      const fetchBookmarks = async () => {
        const data = await bookmarkService.getBookmarks(filters)
        setBookmarks(data)
      }
      fetchBookmarks()
    }
  }
}
```

### useAuth Hook (AuthProvider使用)
```typescript
// components/common/auth-provider.tsx - 最適化済み実装
import type { User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 初回セッション取得
    const getInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getInitialSession()

    // 認証状態変更の監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setLoading(false)
        return
      }

      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOutUser = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthはAuthProvider内で使用する必要があります')
  }
  return context
}
```

**重要な変更点**:
- **ホワイトリストチェック削除**: セッション復帰時の冗長なDB問い合わせを削除
- **パフォーマンス向上**: 認証状態管理のみに集中
- **セキュリティ保証**: Supabase RLSが確実な保護を提供

### useTags Hook
```typescript
// hooks/use-tags.ts - Realtimeなしのシンプルタグ管理
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { TagRow } from '@/types/database'

export function useTags() {
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // タグ取得関数（useCallbackで依存関係を管理）
  const fetchTags = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('display_order', { ascending: true }) // 表示順序

      if (error) throw error

      setTags(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tags')
    } finally {
      setLoading(false)
    }
  }, [])

  // 初回タグ取得
  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // Realtime更新は削除 - 手動でステート更新する方式に変更

  const createTag = async (data: {
    name: string
    color?: string
    display_order?: number
  }) => {
    try {
      const { data: newTag, error } = await supabase
        .from('tags')
        .insert(data)
        .select()
        .single()

      if (error) throw error
      
      // 手動でステート更新
      setTags(prev => [...prev, newTag])
      
      return newTag
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag')
      throw err
    }
  }

  const updateTag = async (id: string, updates: Partial<TagRow>) => {
    try {
      const { data: updatedTag, error } = await supabase
        .from('tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      
      // 手動でステート更新
      setTags(prev => prev.map(tag => tag.id === id ? updatedTag : tag))
      
      return updatedTag
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag')
      throw err
    }
  }

  const deleteTag = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // 手動でステート更新
      setTags(prev => prev.filter(tag => tag.id !== id))
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag')
      throw err
    }
  }

  // タグの並び順更新
  const reorderTags = async (updates: { id: string; display_order: number }[]) => {
    try {
      for (const update of updates) {
        await supabase
          .from('tags')
          .update({ display_order: update.display_order })
          .eq('id', update.id)
      }
      
      // 更新後に再取得してステート更新
      await fetchTags()
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder tags')
      throw err
    }
  }

  return {
    tags,
    loading,
    error,
    createTag,
    updateTag,
    deleteTag,
    reorderTags,
    refetch: fetchTags
  }
}
```

## コンポーネント設計

### BookmarkCard コンポーネント
```typescript
// components/bookmarks/bookmark-card.tsx
import { useState } from 'react'
import { BookmarkRow } from '@/types/database'

// 独立したコンポーネントとして設計し、更新処理は親コンポーネントに任せる
interface BookmarkCardProps {
  bookmark: BookmarkRow
  onUpdate?: (id: string, updates: Partial<BookmarkRow>) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function BookmarkCard({ bookmark, onUpdate, onDelete }: BookmarkCardProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleFavorite = async () => {
    if (isUpdating || !onUpdate) return
    
    setIsUpdating(true)
    try {
      await onUpdate(bookmark.id, {
        is_favorite: !bookmark.is_favorite
      })
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleTogglePin = async () => {
    if (isUpdating || !onUpdate) return
    
    setIsUpdating(true)
    try {
      await onUpdate(bookmark.id, {
        is_pinned: !bookmark.is_pinned,
        pinned_at: bookmark.is_pinned ? null : new Date().toISOString()
      })
    } catch (error) {
      console.error('Failed to toggle pin:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !confirm('このブックマークを削除しますか？')) return
    
    try {
      await onDelete(bookmark.id)
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
    }
  }

  return (
    <div className="bookmark-card border rounded-lg p-4 hover:shadow-md transition-shadow">
      {bookmark.thumbnail_url && (
        <img 
          src={bookmark.thumbnail_url} 
          alt=""
          className="w-full h-48 object-cover rounded mb-3"
          loading="lazy"
        />
      )}
      
      <h3 className="font-semibold text-lg mb-2">
        <a 
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800"
        >
          {bookmark.title || 'Untitled'}
        </a>
      </h3>
      
      {bookmark.description && (
        <p className="text-gray-600 text-sm mb-3 line-clamp-3">
          {bookmark.description}
        </p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleFavorite}
            disabled={isUpdating}
            className={`p-1 rounded ${
              bookmark.is_favorite 
                ? 'text-red-500 hover:text-red-600' 
                : 'text-gray-400 hover:text-red-500'
            }`}
          >
            ♥
          </button>
          
          <button
            onClick={handleTogglePin}
            disabled={isUpdating}
            className={`p-1 rounded ${
              bookmark.is_pinned 
                ? 'text-blue-500 hover:text-blue-600' 
                : 'text-gray-400 hover:text-blue-500'
            }`}
          >
            📌
          </button>
        </div>
        
        <button
          onClick={handleDelete}
          className="text-gray-400 hover:text-red-500 p-1 rounded"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}
```

### TagsList コンポーネント
```typescript
// components/tags/tags-list.tsx - シンプルなフラットリスト
import { useState } from 'react'
import { useTags } from '@/hooks/use-tags'
import type { TagRow } from '@/types/database'

export function TagsList() {
  const { tags, updateTag, deleteTag, reorderTags } = useTags()
  const [draggedTag, setDraggedTag] = useState<string | null>(null)

  const handleDragStart = (tagId: string) => {
    setDraggedTag(tagId)
  }

  const handleDrop = async (targetTagId: string) => {
    if (!draggedTag || draggedTag === targetTagId) return

    try {
      // 並び順の変更のみサポート（簡略化実装）
      console.log('Reorder:', { draggedTag, targetTagId })
      // 実際の実装では、ドラッグ先の位置に応じてdisplay_orderを更新
    } catch (error) {
      console.error('Failed to move tag:', error)
    } finally {
      setDraggedTag(null)
    }
  }

  const renderTag = (tag: TagRow) => (
    <div
      key={tag.id}
      className="tag-item"
      draggable
      onDragStart={() => handleDragStart(tag.id)}
      onDrop={(e) => {
        e.preventDefault()
        handleDrop(tag.id)
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
        <span className="font-medium">{tag.name}</span>
        <span className="text-xs text-gray-500">#{tag.id.slice(-6)}</span>
      </div>
    </div>
  )

  return (
    <div className="tags-list">
      <h3 className="text-lg font-semibold mb-4">タグ一覧</h3>
      <div className="space-y-1">
        {tags.map(renderTag)}
      </div>
    </div>
  )
}
```

## PWA対応（Chrome拡張機能連携）

### Manifest V3 構成
```json
{
  "manifest_version": 3,
  "name": "Encore - Read Later",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus"
  ],
  "host_permissions": [
    "https://your-encore-app.vercel.app/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### 拡張機能とWebアプリの連携
- PostMessage API による通信
- JWT トークンベースの認証
- Chrome Storage API でのローカル設定保存

### Chrome拡張機能での新規ブックマーク作成時の即時反映
```typescript
// chrome-extension/content-script.js
const createBookmarkFromExtension = async (bookmarkData) => {
  try {
    // WebアプリのAPIを呼び出してブックマーク作成
    const response = await fetch('https://your-app.com/api/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify(bookmarkData)
    })
    
    if (response.ok) {
      // Webアプリが開いている場合、PostMessageで通知
      window.postMessage({
        type: 'BOOKMARK_CREATED_FROM_EXTENSION',
        bookmark: await response.json()
      }, '*')
    }
  } catch (error) {
    console.error('Failed to create bookmark from extension:', error)
  }
}
```

```typescript
// Webアプリ側でのPostMessage受信処理
// pages/bookmarks/index.tsx
useEffect(() => {
  const handleExtensionMessage = (event: MessageEvent) => {
    if (event.data.type === 'BOOKMARK_CREATED_FROM_EXTENSION') {
      // 拡張機能からの新規ブックマーク作成を即座に反映
      const { bookmark } = event.data
      // useBookmarksのcreateBookmarkを呼び出してステート更新
      // または直接setBookmarksでステート更新
    }
  }
  
  window.addEventListener('message', handleExtensionMessage)
  return () => window.removeEventListener('message', handleExtensionMessage)
}, [])
```

## 使用例

### ブックマーク一覧ページ（Realtime有効）
```typescript
// pages/bookmarks/index.tsx
export default function BookmarksListPage() {
  const { bookmarks, loading } = useBookmarks({
    enableRealtime: true // 一覧ページではリアルタイムを有効化
  })
  
  // ...
}
```

### ブックマーク編集ページ（Realtime無効）
```typescript
// pages/bookmarks/[id]/edit.tsx
export default function BookmarkEditPage() {
  const { updateBookmark } = useBookmarks() // enableRealtime: falseがデフォルト
  
  // 編集後は手動でステート更新される
}
```

## Realtime購読のベストプラクティス

### 重複・初期同期の落とし穴と対策

#### 1. 重複購読の防止（コンポーネント再マウント対策）

**問題**: Reactのコンポーネントが再マウントされると、同じチャンネルに対して複数回購読してしまう可能性がある

**対策**: チャンネル名の一意性とクリーンアップを徹底する

```typescript
useEffect(() => {
  if (!enableRealtime || !user) return
  
  // ユニークなチャンネル名を生成（ユーザーIDを含む）
  const channelName = `bookmarks-${user.id}-${Math.random().toString(36).substr(2, 9)}`
  
  console.log('📡 Creating channel:', channelName)
  
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'bookmarks',
      filter: `user_id=eq.${user.id}`
    }, handleRealtimeEvent)
    .subscribe((status) => {
      console.log('Subscription status:', status)
    })
  
  // クリーンアップは必須
  return () => {
    console.log('🔌 Cleaning up channel:', channelName)
    supabase.removeChannel(channel)
  }
}, [enableRealtime, user?.id])
```

#### 2. Singleton Supabaseクライアントの確保

**重要**: 必ず単一のSupabaseクライアントインスタンスを使用する

```typescript
// lib/supabase.ts - Singletonパターン
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singletonパターンでクライアントを作成
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

// 複数のSupabaseクライアントを作成するのは絶対に避ける
```

#### 3. 正しい初期化順序：select → subscribe

**必須パターン**: 初期データ取得完了後にRealtime購読を開始する

```typescript
export function useBookmarks({ enableRealtime = false } = {}) {
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // ステップ1: 初期データを取得
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('bookmarks')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (error) throw error
        
        setBookmarks(data || [])
        setIsInitialized(true) // 初期化完了フラグ
      } catch (err) {
        console.error('Failed to fetch initial bookmarks:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchInitialData()
  }, [])
  
  // ステップ2: 初期化完了後にRealtime購読開始
  useEffect(() => {
    if (!enableRealtime || !isInitialized) return
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    console.log('🚀 Starting Realtime subscription after initial data load')
    
    const channel = supabase
      .channel(`bookmarks-realtime-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public', 
        table: 'bookmarks',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        console.log('📨 Realtime event:', payload.eventType)
        
        // 初期データロード完了後のイベントのみ処理
        switch (payload.eventType) {
          case 'INSERT':
            setBookmarks(prev => [payload.new as BookmarkRow, ...prev])
            break
          case 'UPDATE':  
            setBookmarks(prev => prev.map(bookmark => 
              bookmark.id === payload.new.id ? payload.new as BookmarkRow : bookmark
            ))
            break
          case 'DELETE':
            setBookmarks(prev => prev.filter(bookmark => bookmark.id !== payload.old.id))
            break
        }
      })
      .subscribe()
    
    return () => {
      console.log('🔌 Unsubscribing from Realtime')
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, isInitialized])
  
  return { bookmarks, loading, isInitialized }
}
```

#### 4. backfillは不要 - イベント駆動のみ

**重要**: Realtime購読開始後はバックフィル（過去データの再取得）は不要。新しいイベントのみを処理する。

```typescript
// ❌ 悪い例：イベント受信時に毎回データを再取得
const handleRealtimeEvent = async (payload) => {
  // データを再取得するのは無駄で重い処理
  const { data } = await supabase.from('bookmarks').select('*')
  setBookmarks(data)
}

// ✅ 良い例：イベントの内容のみをステートに反映
const handleRealtimeEvent = (payload) => {
  if (payload.eventType === 'INSERT') {
    setBookmarks(prev => [payload.new, ...prev])
  } else if (payload.eventType === 'UPDATE') {
    setBookmarks(prev => prev.map(item => 
      item.id === payload.new.id ? payload.new : item
    ))
  } else if (payload.eventType === 'DELETE') {
    setBookmarks(prev => prev.filter(item => item.id !== payload.old.id))
  }
}
```

#### 5. エラーハンドリングと復旧機能

```typescript
useEffect(() => {
  if (!enableRealtime || !isInitialized) return
  
  let retryCount = 0
  const maxRetries = 3
  
  const setupRealtime = () => {
    const channel = supabase
      .channel(`bookmarks-${user.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookmarks', 
        filter: `user_id=eq.${user.id}`
      }, handleRealtimeEvent)
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && retryCount < maxRetries) {
          console.warn(`Realtime connection failed, retrying... (${retryCount + 1}/${maxRetries})`)
          retryCount++
          setTimeout(() => setupRealtime(), 2000 * retryCount)
        } else if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription successful')
          retryCount = 0
        }
      })
    
    return () => supabase.removeChannel(channel)
  }
  
  return setupRealtime()
}, [enableRealtime, isInitialized])
```

### まとめ

- **初期化順序**: select → subscribe（初期データ完了後にRealtime購読）
- **Singletonクライアント**: 必ず単一のSupabaseクライアントを使用
- **重複防止**: ユニークなチャンネル名と確実なクリーンアップ
- **イベント駆動**: backfillは不要、新しいイベントのみを処理
- **エラー復旧**: 接続失敗時の自動再試行機能を実装