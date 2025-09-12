import { type NextRequest, NextResponse } from 'next/server'
import { validateApiAuth, createClient } from '@/lib/supabase-server'
import type { CreateTagData } from '@/types/database'

// GET /api/tags - タグ一覧取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // サーバーサイドSupabaseクライアントを作成
    const supabase = await createClient()

    // タグ一覧を取得
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Failed to fetch tags:', error)
      return NextResponse.json(
        { error: 'タグの取得に失敗しました' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      data: data || [],
      message: 'タグを正常に取得しました',
    })
  } catch (error) {
    console.error('GET /api/tags error:', error)
    return NextResponse.json(
      {
        error: 'タグの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

// POST /api/tags - タグ作成
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // サーバーサイドSupabaseクライアントを作成
    const supabase = await createClient()

    // リクエストボディ解析
    const body: CreateTagData = await request.json()
    const { name, color, display_order } = body

    // バリデーション
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'タグ名が必要であり、空でない文字列である必要があります' },
        { status: 400 },
      )
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: 'タグ名は50文字以内である必要があります' },
        { status: 400 },
      )
    }

    // 重複チェック
    const { data: existing } = await supabase
      .from('tags')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('name', name.trim())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: '同名のタグが既に存在します' },
        { status: 409 },
      )
    }

    // display_order の決定（指定されていない場合は最後に追加）
    let finalDisplayOrder = display_order
    if (finalDisplayOrder === undefined) {
      const { data: maxOrderTag } = await supabase
        .from('tags')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single()

      finalDisplayOrder = (maxOrderTag?.display_order || 0) + 1
    }

    // タグ作成
    const { data: newTag, error } = await supabase
      .from('tags')
      .insert({
        name: name.trim(),
        color: color || '#6366f1',
        display_order: finalDisplayOrder,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create tag:', error)
      return NextResponse.json(
        { error: 'タグの作成に失敗しました' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        data: newTag,
        message: 'タグが正常に作成されました',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/tags error:', error)
    return NextResponse.json(
      {
        error: 'タグの作成に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
