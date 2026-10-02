import { useSyncExternalStore } from 'react'

// 設定「顯示已完成任務」— whether completed tasks are drawn on the calendar
// (day / week / month). Device-level display pref in localStorage, same
// pattern as lib/taiwan-holidays.ts: user_settings has no column for it and
// this change may not add one. Takes effect immediately, no 儲存 needed.

export const SHOW_COMPLETED_KEY = 'huddle.calendar.showCompleted'

const CHANGE_EVENT = 'huddle:show-completed-changed'

export function getShowCompletedTasks(): boolean {
  if (typeof window === 'undefined') return true
  try {
    // Default ON — never having set it keeps today's behaviour.
    return window.localStorage.getItem(SHOW_COMPLETED_KEY) !== '0'
  } catch {
    return true
  }
}

export function setShowCompletedTasks(show: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SHOW_COMPLETED_KEY, show ? '1' : '0')
  } catch {
    /* private mode etc. */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* no-op */
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function useShowCompletedTasks(): boolean {
  return useSyncExternalStore(subscribe, getShowCompletedTasks, () => true)
}
