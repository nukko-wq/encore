'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import SignOutButton from '@/components/common/sign-out-button'

export interface NavItem {
  href: string
  label: string
  isActive?: boolean
}

interface HeaderProps {
  navItems?: NavItem[]
}

export default function Header({ navItems = [] }: HeaderProps) {
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userResponse = await fetch('/api/auth/user')
        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData.user)
        }
      } catch (err) {
        console.error('Error fetching user data:', err)
      }
    }

    fetchUserData()
  }, [])

  return (
    <nav className="bg-white shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link
                href="/dashboard"
                className="text-xl font-bold text-gray-900 hover:text-gray-700"
              >
                Encore
              </Link>
            </div>
            {navItems.length > 0 && (
              <div className="hidden sm:ml-6 sm:flex sm:items-center">
                <nav className="flex space-x-8">
                  {navItems.map((item) => (
                    <div key={item.href}>
                      {item.isActive ? (
                        <span className="text-blue-600 px-3 py-2 text-sm font-medium">
                          {item.label}
                        </span>
                      ) : (
                        <Link
                          href={item.href}
                          className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
                        >
                          {item.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </nav>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user?.email}</span>
            <SignOutButton />
          </div>
        </div>
      </div>
    </nav>
  )
}
