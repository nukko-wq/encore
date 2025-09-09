'use client'

import { useState, useRef, useEffect } from 'react'
import { Button, Input, Label } from 'react-aria-components'

interface TagSearchInputProps {
  value: string
  onChange: (value: string) => void
  onCreateNew?: (name: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function TagSearchInput({
  value,
  onChange,
  onCreateNew,
  placeholder = 'タグを検索...',
  disabled = false,
}: TagSearchInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ポップオーバーが開かれたときにフォーカスを当てる
  useEffect(() => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus()
    }
  }, [disabled])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onCreateNew && value.trim()) {
      e.preventDefault()
      onCreateNew(value.trim())
    }
  }

  const handleCreateClick = () => {
    if (onCreateNew && value.trim()) {
      onCreateNew(value.trim())
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Label className="sr-only">タグ検索</Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full pl-10 pr-4 py-2 border rounded-md text-sm outline-none transition-colors duration-200 ${
              isFocused
                ? 'border-blue-500 ring-2 ring-blue-500/20'
                : 'border-gray-300 hover:border-gray-400'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="タグを検索または新規作成"
          />
        </div>
      </div>

      {/* 新規作成ボタン */}
      {onCreateNew && value.trim() && (
        <Button
          onPress={handleCreateClick}
          isDisabled={disabled}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md outline-none transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新しいタグ「{value.trim()}」を作成
        </Button>
      )}
    </div>
  )
}