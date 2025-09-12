import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'

/**
 * 拡張機能用の認証チェックエンドポイント
 * クッキーベースのセッション認証をサポート
 */
export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { isAuthenticated: false, user: null },
        {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
          },
        },
      )
    }

    return NextResponse.json(
      {
        isAuthenticated: true,
        user: {
          id: user.id,
          email: user.email,
        },
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        },
      },
    )
  } catch (error) {
    console.error('Extension auth check error:', error)
    return NextResponse.json(
      {
        isAuthenticated: false,
        user: null,
        error: 'Internal server error',
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        },
      },
    )
  }
}

/**
 * CORS preflight requestsに対応
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
    },
  )
}
