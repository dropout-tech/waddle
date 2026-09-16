'use client'

import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

// Curated set — journaling/note-taking themes, not the full emoji keyboard.
// Kept short (24) so the grid stays a single glanceable block, not another
// search-and-scroll picker.
const ICON_OPTIONS = [
  '📄', '📝', '✅', '💡', '🎯', '📌',
  '🔥', '🌱', '🐧', '🎨', '🎧', '📚',
  '🧠', '💬', '🗓️', '⭐', '🍀', '🌙',
  '☕', '🛠️', '📈', '🎉', '🔒', '🚀',
]

interface NoteIconPickerProps {
  elevated?: boolean
  icon?: string
  onChange?: (icon: string | undefined) => void
}

// Notion-style leading icon above the title. No icon set yet → a faded 📄
// placeholder invites the click without implying the note already has one.
export function NoteIconPicker({ icon, onChange, elevated = false }: NoteIconPickerProps) {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={icon ? t('更換圖示') : t('加入圖示')}
          title={icon ? t('更換圖示') : t('加入圖示')}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg text-2xl leading-none transition-colors hover:bg-secondary',
            !icon && 'opacity-40',
          )}
        >
          {icon || '📄'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-64 p-2", elevated && "z-max")}>
        <div className="grid grid-cols-6 gap-1">
          {ICON_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji}
              aria-pressed={icon === emoji}
              onClick={() => {
                onChange?.(emoji)
                setOpen(false)
              }}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-secondary',
                icon === emoji && 'bg-accent',
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        {icon && (
          <button
            type="button"
            onClick={() => {
              onChange?.(undefined)
              setOpen(false)
            }}
            className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t('移除圖示')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
