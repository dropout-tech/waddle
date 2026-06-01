// Storage adapter that backs the Supabase auth session with @capacitor/preferences
// on native. localStorage works inside WKWebView but iOS can evict it under
// storage pressure, which would silently log the user out. Preferences persists
// to native key-value storage (UserDefaults on iOS), so sessions survive
// restarts and eviction.
//
// Supabase's `auth.storage` option accepts an async interface, so the
// Promise-returning Preferences API plugs in directly. We dynamic-import the
// plugin inside each method so the web bundle never pulls it in.
export interface SupabaseAsyncStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export function createCapacitorStorage(): SupabaseAsyncStorage {
  return {
    async getItem(key) {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key })
      return value ?? null
    },
    async setItem(key, value) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key, value })
    },
    async removeItem(key) {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key })
    },
  }
}
