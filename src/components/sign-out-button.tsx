'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/lib/supabase'

export default function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    try {
      setIsLoading(true)
      const { error } = await signOut()

      if (error) {
        console.error('Sign out error:', error)
      }

      // ログアウト後はログインページに遷移
      router.push('/login')
    } catch (error) {
      console.error('Unexpected sign out error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm px-3 py-1 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? 'ログアウト中...' : 'ログアウト'}
    </button>
  )
}
