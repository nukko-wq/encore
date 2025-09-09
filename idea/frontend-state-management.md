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

## 状態管理（Supabase Realtime対応）

### useBookmarks Hook
```typescript
// hooks/use-bookmarks.ts - Supabase Realtimeと組み合わせた状態管理
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BookmarkService } from '@/lib/services/bookmarks'
import type { BookmarkRow } from '@/types/database'

export function useBookmarks(filters?: BookmarkFilters) {
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
  
  // Supabase Realtimeでリアルタイム更新（ユーザースコープ絞り込み）
  useEffect(() => {
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel('bookmarks-changes')
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
  }, [])
  
  const createBookmark = async (data: { url: string; title?: string; description?: string }) => {
    try {
      const bookmark = await bookmarkService.createBookmark(data)
      // Realtimeで自動更新されるので、手動更新は不要
      return bookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bookmark')
      throw err
    }
  }
  
  const updateBookmark = async (id: string, updates: Partial<BookmarkRow>) => {
    try {
      const bookmark = await bookmarkService.updateBookmark(id, updates)
      return bookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bookmark')
      throw err
    }
  }
  
  const deleteBookmark = async (id: string) => {
    try {
      await bookmarkService.deleteBookmark(id)
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
// hooks/use-tags.ts - タグ階層管理対応
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { TagRow } from '@/types/database'

interface TagWithChildren extends TagRow {
  children?: TagWithChildren[]
  level: number
}

export function useTags() {
  const [tags, setTags] = useState<TagRow[]>([])
  const [tagsTree, setTagsTree] = useState<TagWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // タグ取得関数（useCallbackで依存関係を管理）
  const fetchTags = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('parent_tag_id', { ascending: true }) // 親タグを先に
        .order('display_order', { ascending: true })   // 同階層内の順序

      if (error) throw error

      setTags(data || [])
      setTagsTree(buildTagTree(data || []))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tags')
    } finally {
      setLoading(false)
    }
  }, []) // 依存関係は空配列

  // 初回タグ取得
  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // Realtime更新（ユーザースコープ絞り込み）
  useEffect(() => {
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel('tags-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tags',
            filter: `user_id=eq.${user.id}` // ユーザースコープでフィルタ
          },
          () => {
            // タグ更新時は再取得（階層構造のため）
            fetchTags()
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
  }, [fetchTags]) // fetchTagsを依存関係に追加

  const createTag = async (data: {
    name: string
    color?: string
    parent_tag_id?: string
    display_order?: number
  }) => {
    try {
      const { data: newTag, error } = await supabase
        .from('tags')
        .insert(data)
        .select()
        .single()

      if (error) throw error
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder tags')
      throw err
    }
  }

  return {
    tags,
    tagsTree,
    loading,
    error,
    createTag,
    updateTag,
    deleteTag,
    reorderTags
  }
}

// タグ階層ツリー構築
function buildTagTree(tags: TagRow[]): TagWithChildren[] {
  const tagMap = new Map<string, TagWithChildren>()
  const rootTags: TagWithChildren[] = []

  // マップ作成
  tags.forEach(tag => {
    tagMap.set(tag.id, { ...tag, children: [], level: 0 })
  })

  // 階層構築
  tags.forEach(tag => {
    const tagWithChildren = tagMap.get(tag.id)!
    
    if (tag.parent_tag_id) {
      const parent = tagMap.get(tag.parent_tag_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(tagWithChildren)
        tagWithChildren.level = parent.level + 1
      }
    } else {
      rootTags.push(tagWithChildren)
    }
  })

  return rootTags
}
```

## コンポーネント設計

### BookmarkCard コンポーネント
```typescript
// components/bookmarks/bookmark-card.tsx
import { useState } from 'react'
import { BookmarkRow } from '@/types/database'
import { useBookmarks } from '@/hooks/use-bookmarks'

interface BookmarkCardProps {
  bookmark: BookmarkRow
  onUpdate?: (bookmark: BookmarkRow) => void
}

export function BookmarkCard({ bookmark, onUpdate }: BookmarkCardProps) {
  const { updateBookmark, deleteBookmark } = useBookmarks()
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleFavorite = async () => {
    if (isUpdating) return
    
    setIsUpdating(true)
    try {
      const updated = await updateBookmark(bookmark.id, {
        is_favorite: !bookmark.is_favorite
      })
      onUpdate?.(updated)
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleTogglePin = async () => {
    if (isUpdating) return
    
    setIsUpdating(true)
    try {
      const updated = await updateBookmark(bookmark.id, {
        is_pinned: !bookmark.is_pinned,
        pinned_at: bookmark.is_pinned ? null : new Date().toISOString()
      })
      onUpdate?.(updated)
    } catch (error) {
      console.error('Failed to toggle pin:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('このブックマークを削除しますか？')) return
    
    try {
      await deleteBookmark(bookmark.id)
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

### TagsTree コンポーネント
```typescript
// components/tags/tags-tree.tsx
import { useState } from 'react'
import { useTags } from '@/hooks/use-tags'
import type { TagWithChildren } from '@/hooks/use-tags'

export function TagsTree() {
  const { tagsTree, updateTag, deleteTag, reorderTags } = useTags()
  const [draggedTag, setDraggedTag] = useState<string | null>(null)

  const handleDragStart = (tagId: string) => {
    setDraggedTag(tagId)
  }

  const handleDrop = async (targetTagId: string, position: 'before' | 'after' | 'inside') => {
    if (!draggedTag || draggedTag === targetTagId) return

    try {
      if (position === 'inside') {
        // 親子関係の変更
        await updateTag(draggedTag, { parent_tag_id: targetTagId })
      } else {
        // 並び順の変更
        // 実装は複雑になるため、ここでは省略
        console.log('Reorder:', { draggedTag, targetTagId, position })
      }
    } catch (error) {
      console.error('Failed to move tag:', error)
    } finally {
      setDraggedTag(null)
    }
  }

  const renderTag = (tag: TagWithChildren) => (
    <div
      key={tag.id}
      className="tag-item"
      style={{ marginLeft: `${tag.level * 20}px` }}
      draggable
      onDragStart={() => handleDragStart(tag.id)}
      onDrop={(e) => {
        e.preventDefault()
        handleDrop(tag.id, 'inside')
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
      
      {tag.children && tag.children.length > 0 && (
        <div className="tag-children">
          {tag.children.map(renderTag)}
        </div>
      )}
    </div>
  )

  return (
    <div className="tags-tree">
      <h3 className="text-lg font-semibold mb-4">タグ階層</h3>
      <div className="space-y-1">
        {tagsTree.map(renderTag)}
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