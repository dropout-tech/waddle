import { Mark } from '@tiptap/react'
import { inkColorValue, inkHighlightValue, inkSizePx } from '@/lib/whiteboard-style'

// Character-level colour / marker / size, shared by the notebook, sticky notes,
// the whiteboard detail editor and whiteboard cards. Attributes store palette
// KEYS ("red", "yellow", "lg"), never raw CSS: the palette stays readable in
// both themes, and pasting from a web page can't bring in arbitrary colours
// (parseHTML only accepts our own data-* attributes).
// Documents carrying these marks must be stored through lib/styled-doc.ts
// packStyledDoc — older builds blank a document with marks they don't know.

// data-* names are kebab-case (HTML lowercases attribute names).
const span = (name: string, data: string, attribute: string, valid: (key: unknown) => unknown, css: (key: string) => string) => Mark.create({
  name,
  addAttributes() {
    return { [attribute]: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute(`data-${data}`), renderHTML: () => ({}) } }
  },
  parseHTML() {
    return [{ tag: `span[data-${data}]`, getAttrs: el => valid((el as HTMLElement).getAttribute(`data-${data}`)) ? null : false }]
  },
  renderHTML({ mark }) {
    const key = mark.attrs[attribute] as string
    return ['span', valid(key) ? { [`data-${data}`]: key, style: css(key) } : {}, 0]
  },
})

export const TextColor = span('textColor', 'text-color', 'color', inkColorValue, key => `color: ${inkColorValue(key)}`)
export const TextHighlight = span('textHighlight', 'text-highlight', 'color', inkHighlightValue,
  key => `background-color: ${inkHighlightValue(key)}; border-radius: 3px; padding: 0 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone`)
export const TextSize = span('textSize', 'text-size', 'size', inkSizePx, key => `font-size: ${inkSizePx(key)}px${inkSizePx(key)! >= 26 ? '; line-height: 1.3' : ''}`)

export const textStyleMarks = [TextColor, TextHighlight, TextSize]
