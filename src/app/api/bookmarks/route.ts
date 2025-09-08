import { type NextRequest, NextResponse } from 'next/server'
import { bookmarkService } from '@/lib/services/bookmarks'
import { validateApiAuth } from '@/lib/supabase-server'
import type { BookmarkFilters } from '@/types/database'

// GET /api/bookmarks - ブックマーク一覧取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // クエリパラメータ解析
    const { searchParams } = new URL(request.url)
    const filters: BookmarkFilters = {}

    // ステータスフィルタ
    const status = searchParams.get('status')
    if (
      status &&
      (status === 'unread' ||
        status === 'read' ||
        status === 'archived' ||
        status === 'deleted')
    ) {
      filters.status = status
    }

    // お気に入りフィルタ
    const isFavorite = searchParams.get('is_favorite')
    if (isFavorite) {
      filters.is_favorite = isFavorite === 'true'
    }

    // ピン留めフィルタ
    const isPinned = searchParams.get('is_pinned')
    if (isPinned) {
      filters.is_pinned = isPinned === 'true'
    }

    // ブックマーク取得
    const result = await bookmarkService.getBookmarks(filters)

    return NextResponse.json({
      data: result.bookmarks,
      total: result.total,
      page: result.page,
      limit: result.limit,
      has_next: result.has_next,
      has_prev: result.has_prev,
    })
  } catch (error) {
    console.error('GET /api/bookmarks error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch bookmarks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

// POST /api/bookmarks - ブックマーク作成
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // リクエストボディ解析
    const body = await request.json()
    const { url, title, description } = body

    // バリデーション
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 },
      )
    }

    // URL形式チェック
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // 重複チェック
    const existing = await bookmarkService.checkDuplicate(url)
    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate URL',
          message: 'このURLは既に保存されています',
          existing_bookmark: existing,
        },
        { status: 409 },
      )
    }

    // ブックマーク作成
    const bookmark = await bookmarkService.createBookmark({
      url,
      title,
      description,
    })

    return NextResponse.json(
      {
        data: bookmark,
        message: 'Bookmark created successfully',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/bookmarks error:', error)

    // 重複エラーの場合
    if (
      error instanceof Error &&
      error.message.includes('既に保存されています')
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    return NextResponse.json(
      {
        error: 'Failed to create bookmark',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
