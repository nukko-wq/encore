import { type NextRequest, NextResponse } from 'next/server'
import { bookmarkService } from '@/lib/services/bookmarks'
import { validateApiAuth } from '@/lib/supabase-server'
import { normalizeUrl } from '@/lib/url-normalization'

// PATCH /api/bookmarks/[id] - ブックマーク更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // パラメータバリデーション
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'ブックマークIDが必要です' },
        { status: 400 },
      )
    }

    // リクエストボディ解析
    const body = await request.json()

    // 更新データのバリデーション（少なくとも1つのフィールドが必要）
    const allowedFields = [
      'url',
      'canonical_url',
      'title',
      'description',
      'memo',
      'status',
      'is_favorite',
      'is_pinned',
      'tags',
    ]

    const updates = Object.keys(body).reduce(
      (acc, key) => {
        if (allowedFields.includes(key)) {
          acc[key] = body[key]
        }
        return acc
      },
      {} as Record<string, unknown>,
    )

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: '更新するデータが指定されていません' },
        { status: 400 },
      )
    }

    // URLが更新される場合、canonical_urlも自動的に正規化
    if (updates.url && typeof updates.url === 'string') {
      try {
        updates.canonical_url = normalizeUrl(updates.url)
      } catch (_error) {
        return NextResponse.json({ error: '無効なURLです' }, { status: 400 })
      }
    }

    // ブックマーク更新
    const bookmark = await bookmarkService.updateBookmark(id, updates)

    return NextResponse.json({
      data: bookmark,
      message: 'ブックマークが正常に更新されました',
    })
  } catch (error) {
    console.error('PATCH /api/bookmarks/[id] error:', error)
    return NextResponse.json(
      {
        error: 'ブックマークの更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

// DELETE /api/bookmarks/[id] - ブックマーク削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // パラメータバリデーション
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'ブックマークIDが必要です' },
        { status: 400 },
      )
    }

    // ブックマーク削除
    await bookmarkService.deleteBookmark(id)

    return NextResponse.json({
      message: 'ブックマークが正常に削除されました',
    })
  } catch (error) {
    console.error('DELETE /api/bookmarks/[id] error:', error)

    // 存在しないブックマークの場合
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: '指定されたブックマークが見つかりません' },
        { status: 404 },
      )
    }

    return NextResponse.json(
      {
        error: 'ブックマークの削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
