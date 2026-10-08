const WEEK_ZH = '日一二三四五六'
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 10/9（五） / Fri 10/9 */
export function formatMonthDay(date: string, lang: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return lang === 'en' ? `${WEEK_EN[wd]} ${m}/${d}` : `${m}/${d}（${WEEK_ZH[wd]}）`
}
