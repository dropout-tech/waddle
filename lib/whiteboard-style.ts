import type { CSSProperties } from 'react'
import type { ScratchpadItem } from './types'

// Card-level text formatting for whiteboard objects (the "select the text box,
// then press A+ / B" model from slide apps). Lives in item.metadata.style so no
// schema change is needed; character-level formatting, when added, goes into
// the rich document's marks and layers on top of this base style.
export type CardTextSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type CardTextColor = 'default' | 'red' | 'orange' | 'green' | 'blue' | 'purple'
export type CardHighlight = 'none' | 'yellow' | 'green' | 'blue' | 'pink'
export type CardAlign = 'left' | 'center' | 'right'
export interface CardStyle {
  size?: CardTextSize
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: CardTextColor
  highlight?: CardHighlight
  align?: CardAlign
}

export const CARD_TEXT_SIZES: CardTextSize[] = ['sm', 'md', 'lg', 'xl', '2xl']
const SIZE_PX: Record<CardTextSize, number> = { sm: 14, md: 16, lg: 20, xl: 26, '2xl': 34 }

// Mid-tone inks that stay readable on both the cream paper and the dark theme.
export const CARD_TEXT_COLORS: { key: CardTextColor; label: string; value?: string }[] = [
  { key: 'default', label: '預設' },
  { key: 'red', label: '紅色', value: '#d4483b' },
  { key: 'orange', label: '橘色', value: '#d9822b' },
  { key: 'green', label: '綠色', value: '#3f9a5c' },
  { key: 'blue', label: '藍色', value: '#3a78d4' },
  { key: 'purple', label: '紫色', value: '#8a5cc7' },
]
// Translucent marker washes: the text colour underneath still decides contrast.
export const CARD_HIGHLIGHTS: { key: CardHighlight; label: string; value?: string }[] = [
  { key: 'none', label: '無底色' },
  { key: 'yellow', label: '黃色', value: 'rgb(250 204 21 / 0.4)' },
  { key: 'green', label: '綠色', value: 'rgb(74 222 128 / 0.35)' },
  { key: 'blue', label: '藍色', value: 'rgb(96 165 250 / 0.35)' },
  { key: 'pink', label: '粉紅色', value: 'rgb(244 114 182 / 0.35)' },
]

export function getCardStyle(item: Pick<ScratchpadItem, 'metadata'>): CardStyle {
  const style = item.metadata?.style
  return style && typeof style === 'object' ? style as CardStyle : {}
}

export function hasCardStyle(style: CardStyle): boolean {
  return Object.values(style).some(value => value !== undefined)
}

/** Styles for the text block (paragraph or textarea). */
export function cardTextCss(style: CardStyle): CSSProperties {
  return {
    fontSize: style.size ? SIZE_PX[style.size] : undefined,
    lineHeight: style.size && SIZE_PX[style.size] >= 26 ? 1.3 : undefined,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: style.underline ? 'underline' : undefined,
    color: CARD_TEXT_COLORS.find(color => color.key === style.color)?.value,
    textAlign: style.align,
  }
}

/** Marker wash for an inline span wrapping the text (follows line breaks). */
export function cardHighlightCss(style: CardStyle): CSSProperties | undefined {
  const value = CARD_HIGHLIGHTS.find(highlight => highlight.key === style.highlight)?.value
  if (!value) return undefined
  return { backgroundColor: value, borderRadius: 3, padding: '0 2px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }
}

export function stepCardSize(style: CardStyle, direction: 1 | -1): CardTextSize {
  const index = CARD_TEXT_SIZES.indexOf(style.size ?? 'md')
  return CARD_TEXT_SIZES[Math.max(0, Math.min(CARD_TEXT_SIZES.length - 1, index + direction))]
}
