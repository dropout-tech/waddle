// Local rule-based parser for 「亂丟一句話」 brain dumps.
//
//   parseBrainDump('明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動', now, 'zh-TW')
//   → 回康庭的信 (tomorrow) / 去銀行 (afternoon) / 把報價改完 (60 min, due Fri) / 運動
//
// Pure and synchronous: no React, no network, no '@/' imports (the node
// verify script transpiles this file as-is). The AI socket in ./ai.ts can
// replace it later with the same output type; this stays as the fallback.
//
// Design rules
// - Every date goes through resolveWhen(): the text is only classified
//   (今天 / 明天 / 週五 / 10/9), never "computed" ad hoc.
// - Time words are cut out of the title so 「下午去銀行」 reads 「去銀行」.
// - Both languages are always tried — people mix 中文 and English — `lang`
//   only decides small presentation details (capitalising English titles).

import type { BrainDumpDraft, BrainDumpLang, BrainDumpWhen, DayPart } from './types'

// ───────────────────────── date helpers ─────────────────────────

/** Local YYYY-MM-DD (same as lib/calendar-utils toDateString). */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + days)
  return out
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
function isoWeekday(d: Date): number {
  const w = d.getDay()
  return w === 0 ? 7 : w
}

/** Deterministic WHEN → YYYY-MM-DD, anchored on `now` (device local time). */
export function resolveWhen(when: BrainDumpWhen, now: Date): string {
  switch (when.kind) {
    case 'today':
      return dateKey(now)
    case 'relative_days':
      return dateKey(addDays(now, Math.max(0, Math.min(366, Math.round(when.days)))))
    case 'weekday': {
      const target = Math.min(7, Math.max(1, Math.round(when.weekday)))
      const today = isoWeekday(now)
      if (when.week === 'next') {
        // That weekday in next Monday-based week.
        return dateKey(addDays(now, 7 - (today - 1) + (target - 1)))
      }
      return dateKey(addDays(now, (target - today + 7) % 7))
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(when.date) ? when.date : dateKey(now)
  }
}

/** 'today' | 'tomorrow' | YYYY-MM-DD for a resolved date. */
export function dayToken(date: string, now: Date): string {
  if (date === dateKey(now)) return 'today'
  if (date === dateKey(addDays(now, 1))) return 'tomorrow'
  return date
}

/** Inverse of dayToken. */
export function dayTokenToDate(token: string, now: Date): string {
  if (token === 'today') return dateKey(now)
  if (token === 'tomorrow') return dateKey(addDays(now, 1))
  return token
}

/** M/D written without a year: this year, or next year if already past. */
function monthDayToDate(month: number, day: number, now: Date): string | null {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null
  let d = new Date(now.getFullYear(), month - 1, day)
  if (d.getMonth() !== month - 1) return null
  if (dateKey(d) < dateKey(now)) d = new Date(now.getFullYear() + 1, month - 1, day)
  return dateKey(d)
}

// ───────────────────────── number helpers ─────────────────────────

const ZH_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/** '3' | '1.5' | '三' | '十二' | '二十' → number (NaN when not a number). */
export function parseNumber(raw: string): number {
  const s = raw.trim()
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)
  if (!s) return NaN
  if (s === '十') return 10
  const ten = s.indexOf('十')
  if (ten === -1) return s.length === 1 && s in ZH_DIGIT ? ZH_DIGIT[s] : NaN
  const tens = ten === 0 ? 1 : ZH_DIGIT[s.slice(0, ten)]
  const ones = ten === s.length - 1 ? 0 : ZH_DIGIT[s.slice(ten + 1)]
  if (tens === undefined || ones === undefined) return NaN
  return tens * 10 + ones
}

const ZH_NUM = '[一二兩两三四五六七八九十]{1,3}'
/** 「三點前」 is a deadline, but 「三點前往銀行」 (前往 = go to) is not. */
const NOT_QIAN_WORD = '(?![往進进來来去面方後后年天日一輩辈台臺端])'
const WEEKDAY_ZH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 }
const WEEKDAY_EN: [RegExp, number][] = [
  [/^mon/i, 1], [/^tue/i, 2], [/^wed/i, 3], [/^thu/i, 4], [/^fri/i, 5], [/^sat/i, 6], [/^sun/i, 7],
]
const EN_WEEKDAY_FULL = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
const EN_WEEKDAY_ANY = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)'
const EN_NUM_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

function enWeekday(word: string): number {
  for (const [re, n] of WEEKDAY_EN) if (re.test(word)) return n
  return NaN
}

// ───────────────────────── fragment parsing ─────────────────────────

interface FragmentInfo {
  title: string
  minutes?: number
  fixedTime?: string
  part?: DayPart
  when?: BrainDumpWhen
  due?: BrainDumpWhen
  urgent?: boolean
  /** A time of day given as a deadline (「三點前」) — words removed, nothing scheduled. */
  deadlineTime?: boolean
}

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Turn a spoken hour into 24h, using the day part / am-pm when given.
 *
 *  The rule for an hour written WITHOUT 上午/下午 (kept in code, never left to
 *  a model; the Edge Function's clockTo24h in
 *  supabase/functions/brain-dump/contract.ts is the same rule and a test
 *  checks the two agree):
 *    - 1–7 點 reads as the afternoon (「3點開會」 is 15:00)
 *    - 8–12 stay as written (「9點」 is 09:00, 「12點」 is noon), 13+ is 24h
 *    - with a part: 下午／晚上 add 12 below noon, 早上 stays; with am/pm: the usual
 *  「晚上12點」 is midnight — the next day — so it is no time at all (null). */
export function normaliseClock(hRaw: number, m: number, part: DayPart | undefined, ampm?: 'am' | 'pm'): string | null {
  let h = hRaw
  if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59) return null
  if (!ampm && part === 'evening' && h === 12) return null
  if (ampm === 'pm' && h < 12) h += 12
  else if (ampm === 'am' && h === 12) h = 0
  else if (!ampm && (part === 'afternoon' || part === 'evening') && h < 12) h += 12
  else if (!ampm && !part && h >= 1 && h <= 7) h += 12
  if (h < 0 || h > 23) return null
  return hhmm(h, m)
}

const PART_ZH: Record<string, DayPart> = {
  早上: 'morning', 上午: 'morning', 清晨: 'morning', 一早: 'morning', 凌晨: 'morning', 今早: 'morning', 明早: 'morning',
  中午: 'afternoon', 下午: 'afternoon', 午後: 'afternoon',
  傍晚: 'evening', 晚上: 'evening', 晚間: 'evening', 今晚: 'evening', 明晚: 'evening', 下班後: 'evening', 睡前: 'evening',
}

function parseFragment(fragment: string, now: Date): FragmentInfo {
  let rest = ` ${fragment} `
  const info: FragmentInfo = { title: '' }
  /** Run `re` on what's left; on a match call `fn`, and (unless it returns
   *  false) cut the matched words out of the title. */
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void): boolean => {
    const m = rest.match(re)
    if (!m || m.index === undefined) return false
    if (fn(m) === false) return false
    rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`
    return true
  }

  // 1 — urgency markers
  take(/(很急|超急|好急|急件|緊急|趕快|盡快|儘快|馬上)/, () => { info.urgent = true })
  take(/\b(urgent(?:ly)?|asap|right away)\b/i, () => { info.urgent = true })
  take(/[!！]{2,}/, () => { info.urgent = true })

  // 2 — deadlines (before plain days: 「週五前」 must not read as 「週五」)
  take(/(這|本|下)?個?(?:週|周|禮拜|星期)([一二三四五六日天1-7])\s*(?:之)?前/, (m) => {
    info.due = { kind: 'weekday', weekday: WEEKDAY_ZH[m[2]], week: m[1] === '下' ? 'next' : 'this' }
  })
  take(/(今天|明天|後天)\s*(?:之)?前/, (m) => {
    info.due = { kind: 'relative_days', days: m[1] === '今天' ? 0 : m[1] === '明天' ? 1 : 2 }
  })
  take(/(\d{1,2})\s*[/月]\s*(\d{1,2})\s*[號号日]?\s*(?:之)?前/, (m) => {
    const d = monthDayToDate(Number(m[1]), Number(m[2]), now)
    if (!d) return false
    info.due = { kind: 'date', date: d }
  })
  take(/月底\s*(?:之)?前/, () => {
    info.due = { kind: 'date', date: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  })
  take(new RegExp(`\\b(?:by|before|due(?:\\s+on)?)\\s+(this\\s+|next\\s+)?${EN_WEEKDAY_ANY}\\b\\.?`, 'i'), (m) => {
    info.due = { kind: 'weekday', weekday: enWeekday(m[2]), week: /next/i.test(m[1] ?? '') ? 'next' : 'this' }
  })
  take(/\b(?:by|before)\s+(today|tonight|eod|end of (?:the )?day|tomorrow|tmrw?)\b/i, (m) => {
    info.due = { kind: 'relative_days', days: /^(tomorrow|tmr)/i.test(m[1]) ? 1 : 0 }
  })
  take(/\b(?:by|before)\s+(\d{1,2})\/(\d{1,2})\b/i, (m) => {
    const d = monthDayToDate(Number(m[1]), Number(m[2]), now)
    if (!d) return false
    info.due = { kind: 'date', date: d }
  })
  // 「三點前」「下午3點半之前」「3:30前」/ "by 3pm" / "before 15:00": the time a thing
  // is DUE, not an appointment — cut out of the title and never scheduled.
  take(new RegExp(`(早上|上午|中午|下午|晚上|傍晚|凌晨|晚間|午後)?\\s*(?:\\d{1,2}|${ZH_NUM})\\s*[點点](?![點点心子兒])\\s*(?:半|(?:\\d{1,2}|${ZH_NUM})\\s*分?)?\\s*(?:之|以)?前${NOT_QIAN_WORD}`), () => {
    info.deadlineTime = true
  })
  take(new RegExp(`\\d{1,2}\\s*[:：]\\s*\\d{2}\\s*(?:之|以)?前${NOT_QIAN_WORD}`), () => {
    info.deadlineTime = true
  })
  take(/\b(?:by|before|until|till)\s+(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])|\d{1,2}:\d{2}\b|noon\b)/i, () => {
    info.deadlineTime = true
  })

  // 3 — which day
  take(/(大後天|後天|明天|明日|明早|明晚|今天|今日|今晚|今早)/, (m) => {
    const w = m[1]
    info.when = w === '大後天'
      ? { kind: 'relative_days', days: 3 }
      : w === '後天'
        ? { kind: 'relative_days', days: 2 }
        : w.startsWith('明') ? { kind: 'relative_days', days: 1 } : { kind: 'today' }
    if (PART_ZH[w]) info.part = PART_ZH[w]
  })
  take(/(這|本|下)?個?(?:週|周|禮拜|星期)([一二三四五六日天1-7])/, (m) => {
    info.when = { kind: 'weekday', weekday: WEEKDAY_ZH[m[2]], week: m[1] === '下' ? 'next' : 'this' }
  })
  take(/(\d{1,2})\s*[/月]\s*(\d{1,2})\s*[號号日]/, (m) => {
    const d = monthDayToDate(Number(m[1]), Number(m[2]), now)
    if (!d) return false
    info.when = { kind: 'date', date: d }
  })
  take(/\b(the\s+day\s+after\s+tomorrow|today|tonight|tomorrow|tmrw?)\b/i, (m) => {
    const w = m[1].toLowerCase()
    info.when = w.startsWith('the') ? { kind: 'relative_days', days: 2 } : w.startsWith('to') && w !== 'tomorrow' ? { kind: 'today' } : { kind: 'relative_days', days: 1 }
    if (w === 'tonight') info.part = 'evening'
  })
  take(new RegExp(`\\b(?:on\\s+)?(this\\s+|next\\s+)?${EN_WEEKDAY_FULL}\\b`, 'i'), (m) => {
    info.when = { kind: 'weekday', weekday: enWeekday(m[2]), week: /next/i.test(m[1] ?? '') ? 'next' : 'this' }
  })
  take(/\bon\s+(\d{1,2})\/(\d{1,2})\b/i, (m) => {
    const d = monthDayToDate(Number(m[1]), Number(m[2]), now)
    if (!d) return false
    info.when = { kind: 'date', date: d }
  })

  // 4 — clock time (a day part written right before it is part of the match)
  take(new RegExp(`(早上|上午|中午|下午|晚上|傍晚|凌晨|晚間|午後|清晨|半夜|深夜)?\\s*(\\d{1,2}|${ZH_NUM})\\s*[點点](?![點点心子兒])\\s*(半|(\\d{1,2}|${ZH_NUM})\\s*分?)?`), (m) => {
    const before = rest.slice(0, m.index).trimEnd().slice(-1)
    // 「差一點」「早一點」「有點」 are not 1 o'clock.
    if (!m[1] && /[差早晚快慢多少好有]/.test(before)) return false
    const part = m[1] ? PART_ZH[m[1]] : info.part
    const h = parseNumber(m[2])
    const min = m[3] === '半' ? 30 : m[4] ? parseNumber(m[4]) : 0
    let t: string | null
    if (m[1] === '半夜' || m[1] === '深夜') {
      // 「半夜兩點」 is 02:00, 「半夜11點」 is 23:00; 「半夜12點」 is midnight (no same-day time).
      t = h >= 1 && h <= 5 ? hhmm(h, min) : h >= 9 && h <= 11 ? hhmm(h + 12, min) : null
    } else if (m[1] === '中午') {
      // 「中午12點」 noon, 「中午1點」 13:00, but 「中午11點半」 is still before noon.
      t = h >= 10 && h <= 12 ? hhmm(h, min) : h >= 1 && h <= 3 ? hhmm(h + 12, min) : normaliseClock(h, min, part)
    } else {
      t = normaliseClock(h, min, part)
    }
    if (!t) return false
    info.fixedTime = t
    if (m[1] && PART_ZH[m[1]]) info.part = PART_ZH[m[1]]
  })
  if (!info.fixedTime) {
    take(/(?:\bat\s+|@\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i, (m) => {
      const t = normaliseClock(Number(m[1]), Number(m[2] ?? 0), undefined, /^p/i.test(m[3]) ? 'pm' : 'am')
      if (!t) return false
      info.fixedTime = t
    })
  }
  if (!info.fixedTime) {
    take(/(?:\bat\s+)?\b(\d{1,2}):(\d{2})\b/i, (m) => {
      const t = normaliseClock(Number(m[1]), Number(m[2]), info.part)
      if (!t) return false
      info.fixedTime = t
    })
  }
  if (!info.fixedTime) {
    take(/(?:\bat\s+|@\s*)(\d{1,2})\b(?!\s*(?:h|hrs?|hours?|m|mins?|minutes?|[/:.]\d)\b)/i, (m) => {
      const t = normaliseClock(Number(m[1]), 0, info.part)
      if (!t) return false
      info.fixedTime = t
    })
  }
  if (!info.fixedTime) {
    take(/\b(?:at\s+)?noon\b/i, () => { info.fixedTime = '12:00'; info.part = 'afternoon' })
  }

  // 5 — duration
  const setMinutes = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return false
    info.minutes = Math.min(480, Math.max(5, Math.round(n / 5) * 5))
  }
  take(new RegExp(`(\\d+(?:\\.\\d+)?|${ZH_NUM})\\s*個?\\s*半\\s*(?:小時|鐘頭)`), (m) => setMinutes(parseNumber(m[1]) * 60 + 30))
  take(/半\s*個?\s*(?:小時|鐘頭)/, () => setMinutes(30))
  take(new RegExp(`(\\d+(?:\\.\\d+)?|${ZH_NUM})\\s*個?\\s*(?:小時|鐘頭)(?:\\s*(\\d+|${ZH_NUM})\\s*分(?:鐘)?)?`), (m) =>
    setMinutes(parseNumber(m[1]) * 60 + (m[2] ? parseNumber(m[2]) : 0)))
  take(new RegExp(`(\\d+|${ZH_NUM})\\s*分鐘`), (m) => setMinutes(parseNumber(m[1])))
  take(/(\d{2,3})\s*分(?![鐘钟])/, (m) => setMinutes(Number(m[1])))
  take(/\b(?:for\s+)?(?:an?|one)\s+hour\s+and\s+a\s+half\b/i, () => setMinutes(90))
  take(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*m(?:ins?)?\b/i, (m) => setMinutes(Number(m[1]) * 60 + Number(m[2])))
  take(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/i, (m) => setMinutes(Number(m[1]) * 60))
  take(/\b(?:for\s+)?(one|two|three|four|five|six)\s+hours?\b/i, (m) => setMinutes(EN_NUM_WORD[m[1].toLowerCase()] * 60))
  take(/\b(?:for\s+)?half\s+(?:an\s+)?hour\b/i, () => setMinutes(30))
  take(/\b(?:for\s+)?(?:an?|one)\s+hour\b/i, () => setMinutes(60))
  take(/\b(?:for\s+)?(\d+)\s*(?:m|mins?|minutes?)\b/i, (m) => setMinutes(Number(m[1])))

  // 6 — day part words that weren't attached to a clock time
  take(/(早上|上午|清晨|一早|中午|下午|午後|傍晚|晚上|晚間|下班後|睡前)/, (m) => {
    if (!info.part) info.part = PART_ZH[m[1]]
    if (m[1] === '中午' && !info.fixedTime) info.fixedTime = '12:00'
  })
  take(/\b(?:in\s+the\s+|this\s+)?(morning|afternoon|evening)\b/i, (m) => {
    if (!info.part) info.part = m[1].toLowerCase() as DayPart
  })
  take(/\b(?:at\s+night|after\s+work)\b/i, () => { if (!info.part) info.part = 'evening' })

  info.title = cleanTitle(rest)
  return info
}

// ───────────────────────── titles ─────────────────────────

const EDGE_PUNCT = /^[\s\-–—•*·~:：,，、.。;；!！?？()（）[\]「」『』"'`]+|[\s\-–—•*·~:：,，、.。;；!！?？()（）[\]「」『』"'`]+$/g

export function cleanTitle(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  // No stray spaces between CJK characters once time words are cut out.
  s = s.replace(/([㐀-鿿])\s+(?=[㐀-鿿])/g, '$1')
  s = s.replace(/^(?:\d+[.)、]|[☐☑✓✔])\s*/, '')
  s = s.replace(EDGE_PUNCT, '')
  for (let i = 0; i < 4; i++) {
    const before = s
    s = s
      .replace(/^(?:我們|我)?(?:記得要|記得|別忘了|不要忘記|不要忘了|要記得|一定要|需要|必須|還要|還得|順便|也要|要|得)(?=.)/, '')
      .replace(/^(?:的|在|之前)(?=.)/, '')
      .replace(/(?:一下子|一下|吧|喔|哦|啦|呢|唷)+$/, '')
      .replace(/^(?:and\s+|then\s+|also\s+)?(?:i\s+)?(?:(?:need|have|got|want)\s+to|remember\s+to|don'?t\s+forget\s+to|gotta|must|should|please|to)\s+/i, '')
      .replace(/^(?:at|on|by|for|in|before|and|then)\s+/i, '')
      .replace(/\s+(?:at|on|by|for|in|before|around|the|this|next|and|then|from)$/i, '')
      .replace(EDGE_PUNCT, '')
      .trim()
    if (s === before) break
  }
  if (/^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1)
  return s.slice(0, 120)
}

/** Duration guess when none was written: quick replies 15, errands 45,
 *  workouts / meetings / write-ups 60, anything else 30. */
export function guessMinutes(title: string): number {
  if (/回信|回覆|回訊|信件|^回.*信$|email|e-mail|mail|reply|打電話|電話|\bcall\b|\btext\b|訊息|傳訊/i.test(title)) return 15
  if (/運動|健身|跑步|慢跑|游泳|瑜珈|瑜伽|重訓|gym|work\s?out|\brun\b|jog|swim|yoga|exercise|會議|開會|meeting|報告|簡報|提案|report|proposal|slides/i.test(title)) return 60
  if (/銀行|郵局|超市|採買|買|領|寄|bank|post office|grocer|shop|buy|pick up|errand/i.test(title)) return 45
  return 30
}

// ───────────────────────── splitting ─────────────────────────

/** Split a messy paragraph into one fragment per to-do. */
export function splitFragments(text: string): string[] {
  const pieces = text
    .split(/[\n\r]+|[、，,；;。！!？?]+|(?<!\d)\.(?=\s|$)|(?:^|\s)[-*•]\s+/)
    .flatMap((p) => p.split(/還有|然後|再來|另外|以及|接著|\s+(?:and\s+then|then|and\s+also|also|plus)\s+/i))
  const out: string[] = []
  for (const piece of pieces) {
    // English "and" only splits when the right side reads like its own
    // to-do (2+ words) — "call Tom and Amy" stays one item.
    const parts = piece.split(/\s+and\s+/i)
    let acc = parts[0]
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].trim().split(/\s+/).length >= 2 && acc.trim()) {
        out.push(acc)
        acc = parts[i]
      } else {
        acc = `${acc} and ${parts[i]}`
      }
    }
    out.push(acc)
  }
  return out.map((p) => p.trim()).filter(Boolean)
}

// ───────────────────────── entry point ─────────────────────────

export const BRAIN_DUMP_MAX_ITEMS = 20

export function parseBrainDump(text: string, now: Date, _lang: BrainDumpLang = 'zh-TW'): BrainDumpDraft[] {
  const drafts: BrainDumpDraft[] = []
  for (const fragment of splitFragments(text ?? '')) {
    const info = parseFragment(fragment, now)
    const hasInfo = info.minutes !== undefined || info.fixedTime || info.part || info.when || info.due || info.urgent
    if (!info.title) {
      // 「週五前把報價改完，一小時」 — a fragment that is only a time/duration
      // belongs to the to-do right before it.
      const last = drafts[drafts.length - 1]
      if (!last || !hasInfo) continue
      if (info.minutes !== undefined && last.minutesGuessed) {
        last.estimatedMinutes = info.minutes
        last.minutesGuessed = false
      }
      if (info.fixedTime && !last.fixedTime) last.fixedTime = info.fixedTime
      if (info.part && !last.preferredPart) last.preferredPart = info.part
      if (info.due && !last.dueDate) last.dueDate = resolveWhen(info.due, now)
      if (info.when && last.day === 'today') last.day = dayToken(resolveWhen(info.when, now), now)
      if (info.urgent) last.urgency = 8
      last.source = `${last.source}，${fragment}`
      continue
    }
    if (drafts.length >= BRAIN_DUMP_MAX_ITEMS) break
    const dueDate = info.due ? resolveWhen(info.due, now) : undefined
    const minutes = info.minutes ?? guessMinutes(info.title)
    const draft: BrainDumpDraft = {
      id: `bd-${drafts.length}`,
      source: fragment,
      title: info.title,
      estimatedMinutes: minutes,
      minutesGuessed: info.minutes === undefined,
      day: dayToken(info.when ? resolveWhen(info.when, now) : dateKey(now), now),
      ...(dueDate ? { dueDate } : {}),
      ...(info.part ? { preferredPart: info.part } : {}),
      ...(info.fixedTime ? { fixedTime: info.fixedTime } : {}),
    }
    if (info.urgent) draft.urgency = 8
    else if (dueDate && dueDate <= dateKey(addDays(now, 1))) draft.urgency = 7
    drafts.push(draft)
  }
  return drafts
}
