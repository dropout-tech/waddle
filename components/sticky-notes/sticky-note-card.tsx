'use client'

import { useCallback, useRef, useState } from 'react'
import { GripHorizontal, X } from 'lucide-react'
import type { StickyNote, StickyNoteColor, TiptapDoc } from '@/lib/types'
import { StickyNoteEditor } from './sticky-note-editor'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

const MIN_WIDTH = 200
const MIN_HEIGHT = 160
const MAX_WIDTH = 480
const MAX_HEIGHT = 520

const COLORS: { key: StickyNoteColor; label: string }[] = [
  { key: 'yellow', label: '黃色' },
  { key: 'sage', label: '鼠尾草綠' },
  { key: 'rose', label: '玫瑰粉' },
  { key: 'cream', label: '奶油色' },
]

/** Clamp a note's left/top (% of viewport) so it always stays fully on-screen,
 *  given its current pixel width/height and the current viewport size. */
export function clampNotePosition(x: number, y: number, width: number, height: number) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const maxX = Math.max(0, 100 - (width / vw) * 100)
  const maxY = Math.max(0, 100 - (height / vh) * 100)
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) }
}

interface StickyNoteCardProps {
  note: StickyNote
  onFocus: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, width: number, height: number) => void
  onColor: (id: string, color: StickyNoteColor) => void
  onDelete: (id: string) => void
  onContentChange: (id: string, content: TiptapDoc) => void
}

export function StickyNoteCard({
  note,
  onFocus,
  onMove,
  onResize,
  onColor,
  onDelete,
  onContentChange,
}: StickyNoteCardProps) {
  const { t } = useI18n()
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [showColors, setShowColors] = useState(false)
  // Live visual position/size during a gesture; committed to the hook (and
  // Supabase) only on pointer-up, so dragging never spams the network.
  const [live, setLive] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const gesture = useRef<{
    kind: 'move' | 'resize'
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  const x = live?.x ?? note.x
  const y = live?.y ?? note.y
  const width = live?.width ?? note.width
  const height = live?.height ?? note.height

  const beginMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      onFocus(note.id)
      gesture.current = {
        kind: 'move',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: note.x,
        startY: note.y,
        startWidth: note.width,
        startHeight: note.height,
      }
      setDragging(true)
    },
    [note.id, note.x, note.y, note.width, note.height, onFocus],
  )

  const beginResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      onFocus(note.id)
      gesture.current = {
        kind: 'resize',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: note.x,
        startY: note.y,
        startWidth: note.width,
        startHeight: note.height,
      }
      setResizing(true)
    },
    [note.id, note.x, note.y, note.width, note.height, onFocus],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startClientX
    const dy = e.clientY - g.startClientY
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (g.kind === 'move') {
      const nextX = g.startX + (dx / vw) * 100
      const nextY = g.startY + (dy / vh) * 100
      const clamped = clampNotePosition(nextX, nextY, g.startWidth, g.startHeight)
      setLive({ x: clamped.x, y: clamped.y, width: g.startWidth, height: g.startHeight })
    } else {
      const nextWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, g.startWidth + dx))
      const nextHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, g.startHeight + dy))
      const clamped = clampNotePosition(g.startX, g.startY, nextWidth, nextHeight)
      setLive({ x: clamped.x, y: clamped.y, width: nextWidth, height: nextHeight })
    }
  }, [])

  const endGesture = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    setResizing(false)
    if (!g || !live) return
    if (g.kind === 'move') onMove(note.id, live.x, live.y)
    else onResize(note.id, live.width, live.height)
    setLive(null)
  }, [live, note.id, onMove, onResize])

  return (
    <div
      className={cn(
        'sticky-note pointer-events-auto absolute flex flex-col rounded-2xl',
        (dragging || resizing) && 'is-dragging',
      )}
      data-color={note.color}
      data-testid="sticky-note"
      style={{ left: `${x}%`, top: `${y}%`, width, height, zIndex: 41 + note.zIndex }}
      onPointerDown={() => onFocus(note.id)}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none items-center justify-between gap-0.5 rounded-t-2xl pl-2.5 pr-0.5 active:cursor-grabbing"
        onPointerDown={beginMove}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        data-testid="sticky-note-drag-handle"
        aria-label={t('拖曳便條紙')}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden />
        <div className="flex items-center">
          <div className="relative">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setShowColors((v) => !v)}
              aria-label={t('便條紙顏色')}
              className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-black/5"
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-foreground/15"
                style={{ background: `var(--sticky-${note.color})` }}
                aria-hidden
              />
            </button>
            {showColors && (
              <div
                className="absolute right-0 top-11 z-popover flex gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={t(c.label)}
                    onClick={() => {
                      onColor(note.id, c.key)
                      setShowColors(false)
                    }}
                    className={cn(
                      'h-9 w-9 min-h-9 min-w-9 rounded-full border-2',
                      note.color === c.key ? 'border-foreground/50' : 'border-transparent',
                    )}
                    style={{ background: `var(--sticky-${c.key})` }}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (window.confirm(t('確定刪除這張便條紙？'))) onDelete(note.id)
            }}
            aria-label={t('刪除便條紙')}
            className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5 text-foreground/50" aria-hidden />
          </button>
        </div>
      </div>

      <StickyNoteEditor note={note} onContentChange={(content) => onContentChange(note.id, content)} />

      <button
        type="button"
        data-testid="sticky-note-resize-handle"
        aria-label={t('調整便條紙大小')}
        onPointerDown={beginResize}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className={cn(
          'absolute bottom-0 right-0 h-6 w-6 min-h-6 min-w-6 touch-none cursor-se-resize rounded-tl-lg',
          'opacity-0 hover:opacity-100 focus-visible:opacity-100',
          (dragging || resizing) && 'opacity-100',
        )}
      >
        <svg viewBox="0 0 12 12" className="absolute bottom-1 right-1 h-3 w-3 text-foreground/40" aria-hidden>
          <path d="M11 1 1 11M11 6 6 11M11 11h0" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      </button>
    </div>
  )
}
