// Shared set-up for the reminder tests (not a test itself — the CI glob only runs *.test.mjs).
// Lets plain `node --test` import the app's TypeScript: resolves "@/…" aliases and extensionless
// ./relative imports to .ts files, and swaps the native-only modules for stubs.
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const tsFile = (base) =>
  existsSync(base + '.ts') ? base + '.ts' : existsSync(resolve(base, 'index.ts')) ? resolve(base, 'index.ts') : null

const STUBS = {
  '@capacitor/local-notifications': 'export const LocalNotifications=globalThis.__LN',
  '@capacitor/browser': 'export const Browser={open:async()=>{}}',
  '@/lib/platform': 'export const isNative=()=>true;export const isDesktop=()=>false;export const getPlatform=()=>"ios"',
}

export function installReminderTestEnv() {
  registerHooks({
    resolve(specifier, context, next) {
      if (STUBS[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(STUBS[specifier]), shortCircuit: true }
      if (specifier.startsWith('@/')) return next(pathToFileURL(tsFile(resolve(specifier.slice(2)))).href, context)
      if (specifier.startsWith('.') && context.parentURL && !/\.[cm]?[jt]s$/.test(specifier)) {
        const file = tsFile(fileURLToPath(new URL(specifier, context.parentURL)))
        if (file) return next(pathToFileURL(file).href, context)
      }
      return next(specifier, context)
    },
  })
}

/**
 * A fake Capacitor LocalNotifications plugin that behaves like the real one where it matters:
 * `pending` persists between calls, scheduling an id that already exists replaces it, cancel removes by id.
 */
export function installFakeLocalNotifications() {
  const state = { pending: [], permission: 'granted' }
  globalThis.__LN = {
    getPending: async () => ({ notifications: state.pending.map((n) => ({ ...n })) }),
    cancel: async ({ notifications }) => {
      const ids = new Set(notifications.map((n) => n.id))
      state.pending = state.pending.filter((n) => !ids.has(n.id))
    },
    checkPermissions: async () => ({ display: state.permission }),
    requestPermissions: async () => ({ display: state.permission }),
    schedule: async ({ notifications }) => {
      for (const n of notifications) state.pending = state.pending.filter((p) => p.id !== n.id)
      state.pending.push(...notifications.map((n) => ({ ...n })))
    },
    addListener: async () => ({ remove() {} }),
  }
  return state
}

/** Minimal localStorage for modules that read it (widget reminders' on/off switch). */
export function installFakeLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  return store
}
