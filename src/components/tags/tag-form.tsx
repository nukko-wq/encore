'use client'

import { useCallback, useState } from 'react'
import { type TagRow } from '@/hooks/use-tags'

interface TagFormProps {
  editingTag?: TagRow | null
  onSuccess?: () => void
  onCancel?: () => void
  createTag: (data: {
    name: string
    color?: string
    display_order?: number
  }) => Promise<TagRow>
  updateTag: (id: string, updates: Partial<TagRow>) => Promise<TagRow>
}

const COLOR_PRESETS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6b7280', // Gray
  '#374151', // Dark Gray
]

export default function TagForm({
  editingTag,
  onSuccess,
  onCancel,
  createTag,
  updateTag,
}: TagFormProps) {
  const [name, setName] = useState(editingTag?.name || '')
  const [color, setColor] = useState(editingTag?.color || COLOR_PRESETS[0])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim()) {
        setError('タグ名を入力してください')
        return
      }

      setIsSubmitting(true)
      setError(null)

      try {
        if (editingTag) {
          // 更新
          await updateTag(editingTag.id, { name: name.trim(), color })
        } else {
          // 新規作成
          await createTag({
            name: name.trim(),
            color,
            display_order: 0,
          })
        }

        // フォームリセット
        setName('')
        setColor(COLOR_PRESETS[0])

        // 楽観的更新の完了を確実にするため、onSuccessを最後に呼び出し
        if (onSuccess) {
          // React の状態更新を確実に反映させるために次のティックで実行
          await new Promise((resolve) => setTimeout(resolve, 0))
          onSuccess()
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'タグの保存に失敗しました',
        )
      } finally {
        setIsSubmitting(false)
      }
    },
    [name, color, editingTag, updateTag, createTag, onSuccess],
  )

  const handleCancel = useCallback(() => {
    setName('')
    setColor(COLOR_PRESETS[0])
    setError(null)
    onCancel?.()
  }, [onCancel])

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 p-4 border border-gray-200 rounded-lg bg-white"
    >
      <h4 className="text-base font-semibold">
        {editingTag ? 'タグを編集' : '新しいタグを作成'}
      </h4>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* タグ名入力 */}
      <div>
        <label
          htmlFor="tag-name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          タグ名 <span className="text-red-500">*</span>
        </label>
        <input
          id="tag-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="タグ名を入力"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSubmitting}
          required
        />
      </div>

      {/* カラー選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          カラー
        </label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((presetColor) => (
            <button
              key={presetColor}
              type="button"
              onClick={() => setColor(presetColor)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                color === presetColor
                  ? 'border-gray-900 scale-110'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              style={{ backgroundColor: presetColor }}
              disabled={isSubmitting}
              aria-label={`カラーを${presetColor}に設定`}
            />
          ))}
        </div>

        {/* カスタムカラー入力 */}
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
            disabled={isSubmitting}
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#6366f1"
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* プレビュー */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          プレビュー
        </label>
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-gray-900">{name || 'タグ名'}</span>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? '保存中...' : editingTag ? '更新' : '作成'}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}
