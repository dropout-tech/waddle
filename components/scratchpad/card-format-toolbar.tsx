'use client'

import { useState, type ReactNode } from 'react'
import { AArrowDown, AArrowUp, Baseline, Bold, Highlighter, Italic, TextAlignCenter, TextAlignEnd, TextAlignStart, Underline } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { CARD_HIGHLIGHTS, CARD_TEXT_COLORS, CARD_TEXT_SIZES, stepCardSize, type CardAlign, type CardStyle } from '@/lib/whiteboard-style'

const button = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 aria-pressed:bg-primary/10 aria-pressed:text-foreground'
const ALIGN_NEXT: Record<CardAlign, CardAlign> = { left: 'center', center: 'right', right: 'left' }

/**
 * Card-level formatting for the selected whiteboard object. Every control
 * keeps focus where it is (onPointerDown preventDefault) so it also works
 * while the card's text box is open for typing.
 */
export function CardFormatToolbar({ style, onChange }: { style: CardStyle; onChange: (patch: Partial<CardStyle>) => void }) {
  const { t } = useI18n()
  const [palette, setPalette] = useState<'color' | 'highlight' | null>(null)
  const size = style.size ?? 'md'
  const align = style.align ?? 'left'
  const keep = (e: { preventDefault: () => void; stopPropagation: () => void }) => { e.preventDefault(); e.stopPropagation() }
  const tool = (label: string, icon: ReactNode, onClick: () => void, pressed?: boolean, disabled?: boolean) =>
    <button type="button" className={button} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onPointerDown={keep} onClick={onClick}>{icon}</button>
  const inkColor = CARD_TEXT_COLORS.find(color => color.key === style.color)?.value
  const washColor = CARD_HIGHLIGHTS.find(highlight => highlight.key === style.highlight)?.value

  return <div data-testid="card-format-toolbar" role="toolbar" aria-label={t('卡片文字格式')} onPointerDown={e => e.stopPropagation()}
    className="absolute left-2 top-2 z-panel flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded-xl border border-border/60 bg-background/95 p-0.5 text-muted-foreground shadow-sm backdrop-blur-sm max-md:left-3">
    <div className="flex items-center overflow-x-auto">
      {tool(t('縮小字體'), <AArrowDown size={18}/>, () => onChange({ size: stepCardSize(style, -1) }), undefined, size === CARD_TEXT_SIZES[0])}
      {tool(t('放大字體'), <AArrowUp size={18}/>, () => onChange({ size: stepCardSize(style, 1) }), undefined, size === CARD_TEXT_SIZES[CARD_TEXT_SIZES.length - 1])}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden/>
      {tool(t('粗體'), <Bold size={18}/>, () => onChange({ bold: !style.bold || undefined }), !!style.bold)}
      {tool(t('斜體'), <Italic size={18}/>, () => onChange({ italic: !style.italic || undefined }), !!style.italic)}
      {tool(t('底線'), <Underline size={18}/>, () => onChange({ underline: !style.underline || undefined }), !!style.underline)}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden/>
      <button type="button" className={button} aria-label={t('文字顏色')} title={t('文字顏色')} aria-expanded={palette === 'color'} onPointerDown={keep} onClick={() => setPalette(palette === 'color' ? null : 'color')}>
        <span className="flex flex-col items-center"><Baseline size={18}/><span className="-mt-0.5 h-1 w-4 rounded-full" style={{ background: inkColor ?? 'currentColor' }}/></span>
      </button>
      <button type="button" className={button} aria-label={t('螢光筆')} title={t('螢光筆')} aria-expanded={palette === 'highlight'} onPointerDown={keep} onClick={() => setPalette(palette === 'highlight' ? null : 'highlight')}>
        <span className="flex flex-col items-center"><Highlighter size={18}/><span className="-mt-0.5 h-1 w-4 rounded-full border border-border/60" style={{ background: washColor ?? 'transparent' }}/></span>
      </button>
      {tool(align === 'left' ? t('靠左對齊') : align === 'center' ? t('置中對齊') : t('靠右對齊'),
        align === 'left' ? <TextAlignStart size={18}/> : align === 'center' ? <TextAlignCenter size={18}/> : <TextAlignEnd size={18}/>,
        () => { const next = ALIGN_NEXT[align]; onChange({ align: next === 'left' ? undefined : next }) }, align !== 'left')}
    </div>
    {palette && <div className="flex flex-wrap items-center gap-0.5 border-t border-border/60 pt-0.5" role="group" aria-label={palette === 'color' ? t('文字顏色') : t('螢光筆')}>
      {(palette === 'color' ? CARD_TEXT_COLORS : CARD_HIGHLIGHTS).map(swatch => {
        const current = palette === 'color' ? (style.color ?? 'default') : (style.highlight ?? 'none')
        const empty = swatch.key === 'default' || swatch.key === 'none'
        return <button key={swatch.key} type="button" className={button} aria-label={t(swatch.label)} title={t(swatch.label)} aria-pressed={current === swatch.key} onPointerDown={keep}
          onClick={() => { onChange(palette === 'color' ? { color: empty ? undefined : swatch.key as CardStyle['color'] } : { highlight: empty ? undefined : swatch.key as CardStyle['highlight'] }); setPalette(null) }}>
          <span className={cn('h-6 w-6 rounded-full border border-border', empty && 'bg-background')}
            style={empty && palette === 'color' ? { background: 'var(--foreground)' } : empty ? { backgroundImage: 'linear-gradient(135deg, transparent 45%, var(--muted-foreground) 45%, var(--muted-foreground) 55%, transparent 55%)' } : { background: swatch.value }}/>
        </button>
      })}
    </div>}
  </div>
}
