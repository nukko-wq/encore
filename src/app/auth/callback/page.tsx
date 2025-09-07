'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Authentication error:', error)
          router.push('/?error=auth_failed')
          return
        }

        if (data.session) {
          // 認証成功 - ホームページにリダイレクト
          router.push('/')
        } else {
          // セッションなし - ログインページにリダイレクト
          router.push('/?error=no_session')
        }
      } catch (err) {
        console.error('Callback handling error:', err)
        router.push('/?error=callback_failed')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">認証処理中...</p>
      </div>
    </div>
  )
}
