// "how long ago" wording for the bell's overdue card ("最久的一件是 1 週前的" / "The oldest one is from 1 week ago").
// Words only — the numbers come from lib/notifications/task-reminders.ts. Reads the current language when called.
//
// Two wording rules (both were wrong in the first version):
//  - English units are singular for exactly 1: "1 week ago", "2 weeks ago" (the dictionary entries carry the plural
//    markers, see lib/i18n/dict/reports.ts).
//  - Chinese keeps a space before a number, like every other sentence in the app ("有 3 個任務…").

import { getLang, t } from '@/lib/i18n'

/** `days` ago, in the largest sensible unit (day / week / month / year). */
export function relativeDaysAgo(days: number): string {
  if (days === 0) return t('今天')
  if (days === 1) return t('昨天')
  if (days < 7) return t('{n} 天前', { n: days })
  if (days < 30) return t('{n} 週前', { n: Math.floor(days / 7) })
  if (days < 365) return t('{n} 個月前', { n: Math.floor(days / 30) })
  return t('{n} 年前', { n: Math.floor(days / 365) })
}

/** The sentence under "N 個任務已經放了一陣子": names how old the oldest one is. */
export function oldestOverdueMessage(oldestDays: number): string {
  const ago = relativeDaysAgo(oldestDays)
  // "是1 週前的" → "是 1 週前的"; words ("昨天") need no extra space.
  const time = getLang() === 'zh-TW' && /^\d/.test(ago) ? ` ${ago}` : ago
  return t('最久的一件是{time}的。有些也許已經不用做了——放心整理掉，留下真正想做的就好。', { time })
}
