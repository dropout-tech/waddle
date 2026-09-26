// Single source of truth for Huddle's tagline.
//
// The tagline is going to be a quotation (a line plus its author). Until the
// final quote is chosen, this holds a placeholder line with no author. To
// change the tagline everywhere — site metadata, the marketing hero, the auth
// page foot and the notification footer — edit ONLY this object.
// Leave `author` / `authorEn` empty to hide the attribution line.
export const BRAND_QUOTE = {
  quote: '把時間和注意力，還給你。',
  author: '',
  quoteEn: 'Get your time and focus back.',
  authorEn: '',
} as const

export type BrandLang = 'zh' | 'en'

/** Tagline for a given language; `author` is '' when there is none. */
export function brandQuote(lang: BrandLang | 'zh-TW' = 'zh') {
  const en = lang === 'en'
  return {
    quote: en ? BRAND_QUOTE.quoteEn : BRAND_QUOTE.quote,
    author: en ? BRAND_QUOTE.authorEn : BRAND_QUOTE.author,
  }
}

/** "Huddle｜<quote>" for page titles / Open Graph. */
export const BRAND_TITLE = `Huddle｜${BRAND_QUOTE.quote.replace(/[。.]$/, '')}`
export const BRAND_TITLE_EN = `Huddle — ${BRAND_QUOTE.quoteEn}`
