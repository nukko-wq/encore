import { type NextRequest, NextResponse } from 'next/server'
import { validateApiAuth, createClient } from '@/lib/supabase-server'
import type { UpdateTagData } from '@/types/database'

// PATCH /api/tags/[id] - タグ更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // サーバーサイドSupabaseクライアントを作成
    const supabase = await createClient()

    const tagId = params.id

    // リクエストボディ解析
    const body: UpdateTagData = await request.json()

    // 更新可能フィールドの制限
    const allowedFields = ['name', 'color', 'display_order']
    const updates = Object.keys(body).reduce(
      (acc, key) => {
        if (
          allowedFields.includes(key) &&
          body[key as keyof UpdateTagData] !== undefined
        ) {
          acc[key as keyof UpdateTagData] = body[key as keyof UpdateTagData]
        }
        return acc
      },
      {} as Partial<UpdateTagData>,
    )

    // 更新データがない場合
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: '更新するデータがありません' },
        { status: 400 },
      )
    }

    // バリデーション
    if (updates.name !== undefined) {
      if (
        typeof updates.name !== 'string' ||
        updates.name.trim().length === 0
      ) {
        return NextResponse.json(
          { error: 'タグ名は空でない文字列である必要があります' },
          { status: 400 },
        )
      }

      if (updates.name.length > 50) {
        return NextResponse.json(
          { error: 'タグ名は50文字以内である必要があります' },
          { status: 400 },
        )
      }

      // 名前が変更される場合は重複チェック
      const { data: existing } = await supabase
        .from('tags')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('name', updates.name.trim())
        .neq('id', tagId)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: '同名のタグが既に存在します' },
          { status: 409 },
        )
      }

      updates.name = updates.name.trim()
    }

    // タグの存在と所有権チェック
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('id', tagId)
      .eq('user_id', user.id)
      .single()

    if (!existingTag) {
      return NextResponse.json(
        { error: 'タグが見つかりません' },
        { status: 404 },
      )
    }

    // タグ更新
    const { data: updatedTag, error } = await supabase
      .from('tags')
      .update(updates)
      .eq('id', tagId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update tag:', error)
      return NextResponse.json(
        { error: 'タグの更新に失敗しました' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      data: updatedTag,
      message: 'タグが正常に更新されました',
    })
  } catch (error) {
    console.error('PATCH /api/tags/[id] error:', error)
    return NextResponse.json(
      {
        error: 'タグの更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

// DELETE /api/tags/[id] - タグ削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // 認証チェック
    const { user, error: authError } = await validateApiAuth()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // サーバーサイドSupabaseクライアントを作成
    const supabase = await createClient()

    const tagId = params.id

    // タグの存在と所有権チェック
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('id', tagId)
      .eq('user_id', user.id)
      .single()

    if (!existingTag) {
      return NextResponse.json(
        { error: 'タグが見つかりません' },
        { status: 404 },
      )
    }

    // 関連するブックマーク-タグ関係を削除
    const { error: bookmarkTagsError } = await supabase
      .from('bookmark_tags')
      .delete()
      .eq('tag_id', tagId)

    if (bookmarkTagsError) {
      console.error(
        'Failed to delete bookmark-tag relations:',
        bookmarkTagsError,
      )
      return NextResponse.json(
        { error: 'ブックマーク-タグ関係の削除に失敗しました' },
        { status: 500 },
      )
    }

    // タグ削除
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', tagId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to delete tag:', error)
      return NextResponse.json(
        { error: 'タグの削除に失敗しました' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      message: 'タグが正常に削除されました',
    })
  } catch (error) {
    console.error('DELETE /api/tags/[id] error:', error)
    return NextResponse.json(
      {
        error: 'タグの削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
