'use client'

import { Button } from 'react-aria-components'

interface TagColorPickerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  selectedColor: string
  onColorChange: (color: string) => void
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
] as const

export default function TagColorPicker({
  isOpen,
  onOpenChange,
  selectedColor,
  onColorChange,
}: TagColorPickerProps) {
  if (!isOpen) {
    return (
      <Button
        onPress={() => onOpenChange(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 outline-none transition-colors duration-200"
      >
        <div
          className="w-4 h-4 rounded-full border border-gray-300"
          style={{ backgroundColor: selectedColor }}
          aria-hidden="true"
        />
        色を選択
      </Button>
    )
  }

  return (
    <div className="space-y-3 p-3 bg-gray-50 rounded-md">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium text-gray-900">タグの色を選択</h5>
        <Button
          onPress={() => onOpenChange(false)}
          className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center outline-none"
          aria-label="色選択を閉じる"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      {/* プリセット色 */}
      <div className="space-y-2">
        <h6 className="text-xs text-gray-600">プリセット色</h6>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((color) => (
            <Button
              key={color}
              onPress={() => onColorChange(color)}
              className={`w-8 h-8 rounded-full border-2 transition-all duration-200 outline-none ${
                selectedColor === color
                  ? 'border-gray-900 scale-110'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`色を${color}に設定`}
            >
              {selectedColor === color && (
                <svg
                  className="w-4 h-4 text-white mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* カスタム色選択 */}
      <div className="space-y-2">
        <h6 className="text-xs text-gray-600">カスタム色</h6>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
            aria-label="カスタム色を選択"
          />
          <input
            type="text"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            placeholder="#6366f1"
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            pattern="^#[0-9A-Fa-f]{6}$"
            aria-label="色のHEXコードを入力"
          />
        </div>
      </div>

      {/* プレビュー */}
      <div className="space-y-1">
        <h6 className="text-xs text-gray-600">プレビュー</h6>
        <div className="flex items-center gap-2 p-2 bg-white rounded border">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: selectedColor }}
            aria-hidden="true"
          />
          <span className="text-sm text-gray-900">サンプルタグ</span>
        </div>
      </div>
    </div>
  )
}
