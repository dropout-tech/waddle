import { en } from './en'

/**
 * Huddle i18n — source-language-as-key (gettext style).
 *
 * UI strings stay in Traditional Chinese in the source code and are wrapped
 * in t(). When the language is 'en' we look the Chinese text up in the en
 * dictionary; a missing entry falls back to the Chinese original, so an
 * untranslated string can never blank out the UI.
 *
 * The language is a device-level preference (localStorage, like the water
 * reminder), shared by the web app and the Capacitor iOS shell.
 *
 * In React components use `useI18n()` from '@/lib/i18n/react' (it subscribes
 * the component to language changes). Outside render — toasts, notifications,
 * hooks, lib code — import `t` from here directly; it reads the current
 * language at call time.
 */

export type Lang = 'zh-TW' | 'en'

export const LANG_STORAGE_KEY = 'waddle-language-v1'

let current: Lang = 'zh-TW'
const listeners = new Set<() => void>()

function detect(): Lang {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh-TW') return stored
    const nav = window.navigator.language || ''
    return nav.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en'
  } catch {
    return 'zh-TW'
  }
}

function applyHtmlLang(lang: Lang) {
  try {
    document.documentElement.lang = lang
  } catch {
    /* SSR / no DOM */
  }
}

// Client module evaluation runs before first render, so components see the
// detected language immediately. On the server this stays 'zh-TW'; the
// useI18n hook hydrates with 'zh-TW' first to avoid hydration mismatches,
// then flips to the detected language right after mount.
if (typeof window !== 'undefined') {
  current = detect()
  applyHtmlLang(current)
}

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    /* private mode etc. — keep in-memory value */
  }
  applyHtmlLang(lang)
  listeners.forEach((fn) => fn())
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Translate for an explicit language. Used by useI18n so that render output
 * follows the hydration-safe language from useSyncExternalStore (SSR and the
 * first client render both say 'zh-TW', avoiding hydration mismatches).
 */
export function translateFor(
  lang: Lang,
  text: string,
  vars?: Record<string, string | number>
): string {
  let out = lang === 'en' ? (en[text] ?? text) : text
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.split(`{${key}}`).join(String(value))
    }
  }
  return out
}

/**
 * Translate a UI string. `text` is the Traditional Chinese source string and
 * doubles as the dictionary key. Placeholders use single braces:
 *   t('還有 {count} 項任務', { count: 3 })
 * Reads the current language at call time — correct for event-time strings
 * (toasts, notifications). Inside React render, use useI18n()'s `t` instead.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  return translateFor(current, text, vars)
}
