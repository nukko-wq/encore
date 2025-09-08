/**
 * デバッグ用ブックマークAPI
 * RLS問題調査のための詳細情報取得
 */

import { NextResponse } from 'next/server'
import {
  createClient,
  createServiceRoleClient,
  getCurrentUser,
} from '@/lib/supabase-server'

export async function GET() {
  try {
    const user = await getCurrentUser()

    console.log(
      '🔍 Debug bookmarks - User:',
      user ? { id: user.id, email: user.email } : null,
    )

    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 },
      )
    }

    const supabase = await createClient()
    const serviceClient = createServiceRoleClient()

    // 1. 通常クライアントでのブックマーク取得（RLS適用）
    const { data: rlsBookmarks, error: rlsError } = await supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false })

    // 2. サービスロールクライアントでの全ブックマーク取得（RLSバイパス）
    const { data: allBookmarks, error: serviceError } = await serviceClient
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // 3. 認証情報確認

    const { data: authData, error: authError } = await supabase.auth.getUser()

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      authentication: {
        isAuthenticated: !!authData.user,
        authError: authError?.message,
        sessionUser: authData.user
          ? {
              id: authData.user.id,
              email: authData.user.email,
            }
          : null,
      },
      // whitelist checking removed - already authenticated users passed login whitelist check
      bookmarks: {
        rlsCount: rlsBookmarks?.length || 0,
        rlsError: rlsError?.message,
        rlsBookmarks: rlsBookmarks?.slice(0, 3) || [], // 最初の3件のみ表示

        serviceCount: allBookmarks?.length || 0,
        serviceError: serviceError?.message,
        serviceBookmarks: allBookmarks?.slice(0, 3) || [], // 最初の3件のみ表示
      },
      rlsAnalysis: {
        userIdMatches:
          allBookmarks?.filter((b) => b.user_id === user.id).length || 0,
        differentUserBookmarks:
          allBookmarks?.filter((b) => b.user_id !== user.id).length || 0,
        rlsEffective: (rlsBookmarks?.length || 0) < (allBookmarks?.length || 0),
      },
    })
  } catch (error) {
    console.error('Debug bookmarks error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
