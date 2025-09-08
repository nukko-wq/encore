import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証フロー除外ルート（middlewareを適用しない）
  const authFlowRoutes = ['/callback', '/login', '/error', '/', '/debug']
  const isAuthFlowRoute = authFlowRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  // 認証フロー中はmiddlewareをスキップ
  if (isAuthFlowRoute) {
    return NextResponse.next()
  }

  // 認証が必要なルートの定義
  const protectedRoutes = ['/dashboard', '/bookmarks', '/settings']
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  )
  const isApiRoute =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/') &&
    !pathname.startsWith('/api/admin/')

  if (isProtectedRoute || isApiRoute) {
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables in middleware')
      if (isApiRoute) {
        return NextResponse.json(
          { error: 'Configuration error' },
          { status: 500 },
        )
      } else {
        return NextResponse.redirect(
          new URL('/error?message=config_error', request.url),
        )
      }
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    // 認証が必要なルートでユーザーがいない場合
    if (!user) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      } else {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }

    // ユーザーが認証済みでホワイトリストチェックは callbackルート で実行済み

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
