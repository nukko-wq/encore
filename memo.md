変更点（最小）
1) useBookmarks.ts：作成成功後に即時反映

createBookmark の最後で setBookmarks(prev => [created, ...prev]) を呼んでください。これだけで「保存直後にカードが出現」します（ページ全体のリロード不要・一覧側のローディングも不要）。

// use-bookmarks.ts（抜粋・イメージ）
'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Bookmark } from '@/types/database'

type CreateInput = { url: string; title?: string; description?: string }

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 初回取得（ここは今の実装のままでOK）
  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('bookmarks')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        if (!ignore) setBookmarks((data || []) as Bookmark[])
      } catch (e: any) {
        if (!ignore) setError(e.message ?? 'Failed to fetch')
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [])

  // ✅ 作成：成功したら即 state に追加（一覧に瞬時に出す）
  const createBookmark = useCallback(async (input: CreateInput) => {
    const { data, error } = await supabase
      .from('bookmarks')
      .insert({ url: input.url, title: input.title, description: input.description })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    const created = data as Bookmark

    // ←ここが肝：即時反映
    setBookmarks(prev => [created, ...prev])
    return created
  }, [])

  // （任意だが体験UP）削除は楽観的に
  const deleteBookmark = useCallback(async (id: string) => {
    const snapshot = bookmarks
    setBookmarks(prev => prev.filter(b => b.id !== id))
    const { error } = await supabase.from('bookmarks').delete().eq('id', id)
    if (error) {
      setBookmarks(snapshot) // rollback
      throw new Error(error.message)
    }
  }, [bookmarks])

  return { bookmarks, loading, error, createBookmark, deleteBookmark }
}


これで「保存→即カード表示」になります。ページ側の isLoading は初回取得にだけ使われ続け、作成時には触らないので、全体の“読み込み中”が挟まりません（体験がスムーズ）。

2) bookmark-form.tsx：router.refresh() を削除

今は作成後に router.refresh() で全体を再読み込みしているので、これを外します。代わりに createBookmark の戻り値を待つだけで OK。モーダルは閉じるだけでよいです。
（現在の router.refresh() が問題の根本です）

bookmark-form

 // bookmark-form.tsx
   try {
-    await createBookmark({ url: url.trim() })
+    await createBookmark({ url: url.trim() })
     setUrl('')
-    if (onSuccess) {
-      onSuccess()
-    } else {
-      router.refresh() // ← これを削除
-    }
+    onSuccess?.()
     onClose?.()
   } catch (error) { ... }


これで「保存 → 即 state 反映 → モーダルだけ閉じる」という流れになります。
一覧ページ側はそのままでOK（onSuccess でモーダルを閉じるだけの設計になっています）

page

。

（任意）Realtimeで“他経路の追加”も自動反映

拡張機能や他タブからの追加も自動で反映したい場合は、useBookmarks に postgres_changes 購読を加えるだけで完成です。INSERT/UPDATE/DELETE を受けてローカル state を更新します。

useEffect(() => {
  const channel = supabase
    .channel('bookmarks:changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks' }, payload => {
      if (payload.eventType === 'INSERT') {
        setBookmarks(prev => {
          const exists = prev.some(b => b.id === (payload.new as any).id)
          return exists ? prev : [payload.new as Bookmark, ...prev]
        })
      } else if (payload.eventType === 'UPDATE') {
        setBookmarks(prev => prev.map(b => b.id === (payload.new as any).id ? (payload.new as Bookmark) : b))
      } else if (payload.eventType === 'DELETE') {
        setBookmarks(prev => prev.filter(b => b.id !== (payload.old as any).id))
      }
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [])


なお BookmarkCard は useBookmarks().deleteBookmark を呼ぶ形なので、このまま活かせます（削除も楽観的にしておくと快適）

bookmark-card

。

これで何が変わる？

保存直後にカードが出現（全体リロードなし / 一覧のローディングなし）

ボタンだけが「保存中…」（既存のボタン内スピナーで十分。ページの“読み込み中”は不要）

bookmark-form

page

（任意）他タブ・拡張からの追加/削除も自動反映（Realtime）

必要なら、あなたの useBookmarks.ts を上記方針で完全版に書き下ろします。今のリポジトリの supabase クライアントの置き場所（@/lib/supabase など）に合わせて調整します！