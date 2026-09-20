import { createClient } from '@/lib/supabase/client'

// React may mount a callback twice. A PKCE code is single-use: one owner must
// exchange it, and an exchange failure must not silently use an older session.
const exchanges = new Map<string, Promise<boolean>>()
export function completeWebOAuth(code: string): Promise<boolean> {
  if (!code) return Promise.resolve(false)
  const existing = exchanges.get(code)
  if (existing) return existing
  const result = createClient().auth.exchangeCodeForSession(code)
    .then(({ data, error }) => !error && !!data.session)
    .catch(() => false)
  exchanges.set(code, result)
  return result
}
