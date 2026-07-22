'use client'

import { useSyncExternalStore } from 'react'

/**
 * 中華民國（台灣）國定假日資料 + 裝置級顯示開關。
 *
 * 日期依據：行政院人事行政總處「政府行政機關辦公日曆表」官方公告 CSV
 * （114/115/116 年，即西元 2025–2027；116 年已於 2026-05-21 核定公告）。
 * 2025-05-01 勞動節不在此表：《紀念日及節日實施條例》2025-05-28 才生效，
 * 該年勞動節僅勞工放假、非全國性假日。新年度公告後在此逐年增補。
 */
export const TAIWAN_HOLIDAYS: Record<string, string> = {
  // ── 2025（114 年）──────────────────────────────────────────────────────
  '2025-01-01': '元旦',
  '2025-01-27': '小年夜',
  '2025-01-28': '除夕',
  '2025-01-29': '春節',
  '2025-01-30': '春節',
  '2025-01-31': '春節',
  '2025-02-28': '和平紀念日',
  '2025-04-03': '補假', // 兒童節與清明節同日，多補一天
  '2025-04-04': '兒童節、清明節',
  '2025-05-30': '端午節補假',
  '2025-05-31': '端午節',
  '2025-09-28': '教師節',
  '2025-09-29': '教師節補假',
  '2025-10-06': '中秋節',
  '2025-10-10': '國慶日',
  '2025-10-24': '光復節補假',
  '2025-10-25': '台灣光復節',
  '2025-12-25': '行憲紀念日',

  // ── 2026（115 年）──────────────────────────────────────────────────────
  '2026-01-01': '元旦',
  '2026-02-15': '小年夜',
  '2026-02-16': '除夕',
  '2026-02-17': '春節',
  '2026-02-18': '春節',
  '2026-02-19': '春節',
  '2026-02-20': '春節補假',
  '2026-02-27': '和平紀念日補假',
  '2026-02-28': '和平紀念日',
  '2026-04-03': '兒童節補假',
  '2026-04-04': '兒童節',
  '2026-04-05': '清明節',
  '2026-04-06': '清明節補假',
  '2026-05-01': '勞動節',
  '2026-06-19': '端午節',
  '2026-09-25': '中秋節',
  '2026-09-28': '教師節',
  '2026-10-09': '國慶日補假',
  '2026-10-10': '國慶日',
  '2026-10-25': '台灣光復節',
  '2026-10-26': '光復節補假',
  '2026-12-25': '行憲紀念日',

  // ── 2027（116 年）──────────────────────────────────────────────────────
  '2027-01-01': '元旦',
  '2027-02-04': '小年夜',
  '2027-02-05': '除夕',
  '2027-02-06': '春節',
  '2027-02-07': '春節',
  '2027-02-08': '春節',
  '2027-02-09': '春節補假',
  '2027-02-10': '春節補假',
  '2027-02-28': '和平紀念日',
  '2027-03-01': '和平紀念日補假',
  '2027-04-04': '兒童節',
  '2027-04-05': '清明節',
  '2027-04-06': '兒童節補假',
  '2027-04-30': '勞動節補假',
  '2027-05-01': '勞動節',
  '2027-06-09': '端午節',
  '2027-09-15': '中秋節',
  '2027-09-28': '教師節',
  '2027-10-10': '國慶日',
  '2027-10-11': '國慶日補假',
  '2027-10-25': '台灣光復節',
  '2027-12-24': '行憲紀念日補假',
  '2027-12-25': '行憲紀念日',
  '2027-12-31': '元旦補假', // 2028-01-01 逢週六
}

export function getTaiwanHoliday(dateString: string): string | null {
  return TAIWAN_HOLIDAYS[dateString] ?? null
}

// ── Device-level display toggle (localStorage, same pattern as
// lib/water-reminder.ts) ─────────────────────────────────────────────────

export const TAIWAN_HOLIDAYS_ENABLED_KEY = 'waddle.taiwanHolidays.enabled'

const ENABLED_CHANGE_EVENT = 'waddle:taiwan-holidays-enabled-changed'

export function getTaiwanHolidaysEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(TAIWAN_HOLIDAYS_ENABLED_KEY)
    // Default ON — never having set it means "show holidays".
    if (raw === null) return true
    return raw === '1'
  } catch {
    return false
  }
}

export function setTaiwanHolidaysEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TAIWAN_HOLIDAYS_ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    /* private mode etc. */
  }
  try {
    window.dispatchEvent(new CustomEvent(ENABLED_CHANGE_EVENT))
  } catch {
    /* no-op */
  }
}

function subscribeTaiwanHolidaysEnabled(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(ENABLED_CHANGE_EVENT, onChange)
  // Cross-tab sync: another tab flipping the setting fires a native
  // 'storage' event here (but not in the tab that made the change).
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(ENABLED_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getServerTaiwanHolidaysEnabledSnapshot(): boolean {
  return false
}

/**
 * Subscribes the calling component to the "show Taiwan holidays" device
 * preference. Server/first-paint snapshot is `false` to avoid a hydration
 * mismatch; it flips to the real (default-true) value on the client right
 * after mount — a brief flash of "off" is acceptable for this feature.
 */
export function useTaiwanHolidaysEnabled(): boolean {
  return useSyncExternalStore(
    subscribeTaiwanHolidaysEnabled,
    getTaiwanHolidaysEnabled,
    getServerTaiwanHolidaysEnabledSnapshot
  )
}
