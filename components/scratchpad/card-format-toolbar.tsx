'use client'

import { useState, type ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { AArrowDown, AArrowUp, Baseline, Bold, Highlighter, Italic, TextAlignCenter, TextAlignEnd, TextAlignStart, Underline } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { CARD_HIGHLIGHTS, CARD_TEXT_COLORS, CARD_TEXT_SIZES, stepCardSize, type CardAlign, type CardStyle, type CardTextSize } from '@/lib/whiteboard-style'

const button = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 aria-pressed:bg-primary/10 aria-pressed:text-foreground'
const ALIGN_NEXT: Record<CardAlign, CardAlign> = { left: 'center', center: 'right', right: 'left' }

// Card-style key → the editor mark that formats the same thing per character.
export const CARD_STYLE_MARK: Partial<Record<keyof CardStyle, string>> = { size: 'textSize', bold: 'bold', italic: 'italic', underline: 'underline', color: 'textColor', highlight: 'textHighlight' }

/**
 * Formatting for the selected whiteboard object, slide-app style: with words
 * selected in the open text box the buttons format just those words (marks);
 * otherwise they format the whole card (metadata.style). Alignment is always
 * per card. Every control keeps focus where it is (onPointerDown
 * preventDefault) so the selection survives the click.
 */
export function CardFormatToolbar({ style, onChange, editor = null }: { style: CardStyle; onChange: (patch: Partial<CardStyle>) => void; editor?: Editor | null }) {
  const { t } = useI18n()
  const [palette, setPalette] = useState<'color' | 'highlight' | null>(null)
  const marks = useEditorState({
    editor,
    selector: ({ editor: e }) => e && !e.state.selection.empty ? {
      size: e.getAttributes('textSize').size as CardTextSize | undefined,
      color: e.getAttributes('textColor').color as CardStyle['color'] | undefined,
      highlight: e.getAttributes('textHighlight').color as CardStyle['highlight'] | undefined,
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
    } : null,
  })
  const words = !!editor && !!marks
  // What the controls show: the selected words' own formatting over the card's.
  const shown: CardStyle = words ? {
    ...style,
    size: marks.size ?? style.size, color: marks.color ?? style.color, highlight: marks.highlight ?? style.highlight,
    bold: marks.bold || style.bold, italic: marks.italic || style.italic, underline: marks.underline || style.underline,
  } : style
  const apply = (patch: Partial<CardStyle>) => {
    if (!editor) { onChange(patch); return }
    const key = Object.keys(patch)[0] as keyof CardStyle
    const mark = CARD_STYLE_MARK[key]
    if (words && mark) {
      const chain = editor.chain().focus()
      if (key === 'bold' || key === 'italic' || key === 'underline') chain.toggleMark(mark).run()
      else {
        const value = patch[key] as string | undefined
        // Same as the card (or cleared): drop the word-level override.
        if (!value || value === (style[key] ?? (key === 'size' ? 'md' : undefined))) chain.unsetMark(mark).run()
        else chain.setMark(mark, key === 'size' ? { size: value } : { color: value }).run()
      }
      return
    }
    // Whole card while its text box is open: the card value replaces any
    // word-level formatting of the same kind (like re-colouring a whole text
    // box in a slide app), so clear those marks in the live document too.
    if (mark) editor.chain().command(({ tr, state }) => { tr.removeMark(0, state.doc.content.size, state.schema.marks[mark]); return true }).run()
    onChange(patch)
  }
  const size = shown.size ?? 'md'
  const align = style.align ?? 'left'
  const keep = (e: { preventDefault: () => void; stopPropagation: () => void }) => { e.preventDefault(); e.stopPropagation() }
  const tool = (label: string, icon: ReactNode, onClick: () => void, pressed?: boolean, disabled?: boolean) =>
    <button type="button" className={button} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onPointerDown={keep} onClick={onClick}>{icon}</button>
  const inkColor = CARD_TEXT_COLORS.find(color => color.key === shown.color)?.value
  const washColor = CARD_HIGHLIGHTS.find(highlight => highlight.key === shown.highlight)?.value

  return <div data-testid="card-format-toolbar" role="toolbar" aria-label={t('卡片文字格式')} onPointerDown={e => e.stopPropagation()}
    className="absolute left-2 top-2 z-panel flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded-xl border border-border/60 bg-background/95 p-0.5 text-muted-foreground shadow-sm backdrop-blur-sm max-md:left-3">
    <div className="flex items-center overflow-x-auto">
      {tool(t('縮小字體'), <AArrowDown size={18}/>, () => apply({ size: stepCardSize(shown, -1) }), undefined, size === CARD_TEXT_SIZES[0])}
      {tool(t('放大字體'), <AArrowUp size={18}/>, () => apply({ size: stepCardSize(shown, 1) }), undefined, size === CARD_TEXT_SIZES[CARD_TEXT_SIZES.length - 1])}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden/>
      {tool(t('粗體'), <Bold size={18}/>, () => apply({ bold: !shown.bold || undefined }), !!shown.bold)}
      {tool(t('斜體'), <Italic size={18}/>, () => apply({ italic: !shown.italic || undefined }), !!shown.italic)}
      {tool(t('底線'), <Underline size={18}/>, () => apply({ underline: !shown.underline || undefined }), !!shown.underline)}
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
    {words && <p data-testid="card-format-scope" className="px-2 pb-0.5 text-xs text-primary">{t('只改選取的字')}</p>}
    {palette && <div className="flex flex-wrap items-center gap-0.5 border-t border-border/60 pt-0.5" role="group" aria-label={palette === 'color' ? t('文字顏色') : t('螢光筆')}>
      {(palette === 'color' ? CARD_TEXT_COLORS : CARD_HIGHLIGHTS).map(swatch => {
        const current = palette === 'color' ? (shown.color ?? 'default') : (shown.highlight ?? 'none')
        const empty = swatch.key === 'default' || swatch.key === 'none'
        return <button key={swatch.key} type="button" className={button} aria-label={t(swatch.label)} title={t(swatch.label)} aria-pressed={current === swatch.key} onPointerDown={keep}
          onClick={() => { apply(palette === 'color' ? { color: empty ? undefined : swatch.key as CardStyle['color'] } : { highlight: empty ? undefined : swatch.key as CardStyle['highlight'] }); setPalette(null) }}>
          <span className={cn('h-6 w-6 rounded-full border border-border', empty && 'bg-background')}
            style={empty && palette === 'color' ? { background: 'var(--foreground)' } : empty ? { backgroundImage: 'linear-gradient(135deg, transparent 45%, var(--muted-foreground) 45%, var(--muted-foreground) 55%, transparent 55%)' } : { background: swatch.value }}/>
        </button>
      })}
    </div>}
  </div>
}
