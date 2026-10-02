'use client'

import type { Editor } from '@tiptap/react'
import { Baseline, Highlighter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { CARD_HIGHLIGHTS, CARD_TEXT_COLORS, inkColorValue, inkHighlightValue } from '@/lib/whiteboard-style'

export type InkPalette = 'color' | 'highlight'

/** Same palette as the whiteboard card toolbar. "default" / "none" clears the mark. */
export function applyInk(editor: Editor, palette: InkPalette, key: string) {
  const mark = palette === 'color' ? 'textColor' : 'textHighlight'
  const clear = key === 'default' || key === 'none'
  const chain = editor.chain().focus()
  if (clear) chain.unsetMark(mark).run()
  else chain.setMark(mark, { color: key }).run()
}

export function currentInk(editor: Editor, palette: InkPalette): string {
  const key = editor.getAttributes(palette === 'color' ? 'textColor' : 'textHighlight').color as string | undefined
  return key ?? (palette === 'color' ? 'default' : 'none')
}

/** The trigger's icon: the glyph with a bar in the current colour underneath. */
export function InkTriggerIcon({ editor, palette, size = 18 }: { editor: Editor; palette: InkPalette; size?: number }) {
  const key = currentInk(editor, palette)
  const value = palette === 'color' ? inkColorValue(key) : inkHighlightValue(key)
  return <span className="flex flex-col items-center">
    {palette === 'color' ? <Baseline size={size}/> : <Highlighter size={size}/>}
    <span className={cn('-mt-0.5 h-1 w-4 rounded-full', palette === 'highlight' && 'border border-border/60')} style={{ background: value ?? (palette === 'color' ? 'currentColor' : 'transparent') }}/>
  </span>
}

/** One row of colour dots. Buttons keep the editor's selection (mousedown preventDefault). */
export function InkSwatches({ editor, palette, onDone, className }: { editor: Editor; palette: InkPalette; onDone: () => void; className?: string }) {
  const { t } = useI18n()
  const current = currentInk(editor, palette)
  return <div role="group" aria-label={palette === 'color' ? t('文字顏色') : t('螢光筆')} className={cn('flex items-center gap-0.5', className)}>
    {(palette === 'color' ? CARD_TEXT_COLORS : CARD_HIGHLIGHTS).map(swatch => {
      const empty = swatch.key === 'default' || swatch.key === 'none'
      return <button key={swatch.key} type="button" title={t(swatch.label)} aria-label={t(swatch.label)} aria-pressed={current === swatch.key}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-secondary aria-pressed:bg-primary/10 max-md:h-10 max-md:w-10"
        onMouseDown={e => { e.preventDefault(); applyInk(editor, palette, swatch.key); onDone() }}>
        <span className={cn('h-5 w-5 rounded-full border border-border', empty && 'bg-background')}
          style={empty && palette === 'color' ? { background: 'var(--foreground)' } : empty ? { backgroundImage: 'linear-gradient(135deg, transparent 45%, var(--muted-foreground) 45%, var(--muted-foreground) 55%, transparent 55%)' } : { background: swatch.value }}/>
      </button>
    })}
  </div>
}
