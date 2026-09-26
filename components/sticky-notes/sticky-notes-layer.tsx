'use client'

import { useEffect, useRef } from 'react'
import type { StickyNote, TiptapDoc } from '@/lib/types'
import { StickyNoteCard, clampNotePosition } from './sticky-note-card'
import type { useStickyNotes } from '@/hooks/use-sticky-notes'

const RESIZE_DEBOUNCE_MS = 250

interface StickyNotesLayerProps {
  store: ReturnType<typeof useStickyNotes>
}

/**
 * Full-viewport glass pane: fixed over every page. The container itself is
 * `pointer-events: none` so it never blocks clicks on the app underneath —
 * only the note cards (each `pointer-events: auto`) are interactive. New
 * notes come from the "+" button in the toggle bar (StickyNotesToggleBar),
 * not from double-clicking this pane — a covering div can't both "catch a
 * double-click anywhere" and "let clicks through to the app below" at once.
 */
export function StickyNotesLayer({ store }: StickyNotesLayerProps) {
  const { notes, setPosition, setSize, setColor, bringToFront, saveNoteContent, deleteNote } = store
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Keep every note fully on-screen when the window is resized (rotate,
  // resize the browser, split-screen on iPad…) — position is stored as a %
  // of the viewport, but width/height are px, so a note near the edge can
  // still overflow after a shrink.
  useEffect(() => {
    const handleResize = () => {
      clearTimeout(resizeTimer.current)
      resizeTimer.current = setTimeout(() => {
        for (const n of notes) {
          const clamped = clampNotePosition(n.x, n.y, n.width, n.height)
          if (Math.abs(clamped.x - n.x) > 0.1 || Math.abs(clamped.y - n.y) > 0.1) {
            setPosition(n.id, clamped.x, clamped.y)
          }
        }
      }, RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  return (
    <div className="pointer-events-none fixed inset-0 z-overlay" data-testid="sticky-notes-layer">
      {notes.map((note: StickyNote) => (
        <StickyNoteCard
          key={note.id}
          note={note}
          onFocus={bringToFront}
          onMove={setPosition}
          onResize={setSize}
          onColor={setColor}
          onDelete={deleteNote}
          onContentChange={(id: string, content: TiptapDoc) => saveNoteContent(id, content)}
        />
      ))}
    </div>
  )
}
