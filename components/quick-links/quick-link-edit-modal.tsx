'use client'

import { useEffect, useState } from 'react'
import { X, Save, Trash2, Link2, Type, Sparkles, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { detectMeetingProvider } from '@/lib/meeting-utils'
import { cn } from '@/lib/utils'
import type { QuickLink } from '@/lib/types'

interface QuickLinkEditModalProps {
  isOpen: boolean
  /** When provided we're editing; when null we're creating a new one. */
  initial: QuickLink | null
  onClose: () => void
  onSave: (link: QuickLink) => void
  onDelete?: (id: string) => void
}

// Curated palette so user picks stay visually consistent with the
// Waddle workspace colors. Empty = use default border.
const COLOR_OPTIONS = [
  null,
  '#f4d977', // brand yellow
  '#7ec8e3', // soft blue
  '#f4a09e', // soft red
  '#a4d4ae', // mint
  '#c8a4e3', // lavender
  '#f4c279', // peach
] as const

export function QuickLinkEditModal({
  isOpen,
  initial,
  onClose,
  onSave,
  onDelete,
}: QuickLinkEditModalProps) {
  const isEdit = !!initial
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [color, setColor] = useState<string | null>(initial?.color ?? null)

  // Reset form whenever the modal opens with a different target.
  // useState's lazy initializer only fires on mount, so without this an
  // edit-flow modal reopened with a different link would show stale text.
  useEffect(() => {
    if (!isOpen) return
    setTitle(initial?.title ?? '')
    setUrl(initial?.url ?? '')
    setIcon(initial?.icon ?? '')
    setColor(initial?.color ?? null)
  }, [isOpen, initial])

  useBodyScrollLock(isOpen)

  if (!isOpen) return null

  // URL must be a valid http(s) or known video provider URL. Reuses the
  // meeting-utils detector so we get the same scheme-allow-list as the
  // meeting-reminder safety check (blocks javascript:/data:/file:).
  const provider = detectMeetingProvider(url)
  const urlLooksValid = !!url.trim() && (provider !== null || /^https?:\/\//i.test(url.trim()))
  const titleLooksValid = title.trim().length > 0
  const canSave = urlLooksValid && titleLooksValid

  const handleSave = () => {
    if (!canSave) return
    const next: QuickLink = {
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      url: url.trim(),
      icon: icon.trim() || undefined,
      color: color ?? undefined,
      sortOrder: initial?.sortOrder ?? Date.now(),
    }
    onSave(next)
    onClose()
  }

  const handleDelete = () => {
    if (!initial || !onDelete) return
    if (!confirm(`刪除「${initial.title}」？`)) return
    onDelete(initial.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative w-full h-[100dvh] flex flex-col bg-card overflow-hidden animate-in fade-in duration-200 md:h-auto md:max-h-[90vh] md:max-w-md md:mx-4 md:rounded-2xl md:shadow-2xl md:border md:border-border md:zoom-in-95">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? '編輯連結' : '新增連結'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Type className="w-3 h-3" />
              名稱
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：Notion / GitHub / Gmail"
              autoFocus
            />
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Link2 className="w-3 h-3" />
              網址
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              inputMode="url"
            />
            {url.trim().length > 0 && !urlLooksValid && (
              <div className="text-[11px] text-destructive">
                需要 http:// 或 https:// 開頭的網址
              </div>
            )}
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="w-3 h-3" />
              圖示（emoji 或文字，留空自動取名稱第一個字）
            </label>
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="📝 或 GH"
              maxLength={4}
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Palette className="w-3 h-3" />
              色彩
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c ?? '預設'}
                  aria-pressed={color === c}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                  )}
                  style={c ? { backgroundColor: c } : undefined}
                >
                  {!c && (
                    <span className="block w-full h-full rounded-full bg-muted border border-border" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
          {isEdit && onDelete ? (
            <Button variant="ghost" onClick={handleDelete} className="text-destructive">
              <Trash2 className="w-4 h-4" />
              刪除
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSave} disabled={!canSave} className="gap-2">
              <Save className="w-4 h-4" />
              儲存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
