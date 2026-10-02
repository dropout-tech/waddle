// Service-role access to public.revenuecat_deletion_queue (20261002160000), shared by
// delete-account and revenuecat-deletion-retry.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { drainDeletionQueue } from './revenuecat-deletion.mjs'

const TABLE = 'revenuecat_deletion_queue'

export function enqueueDeletion(admin: SupabaseClient) {
  return async (userId: string, message: string) => {
    const { error } = await admin.from(TABLE).upsert(
      { app_user_id: userId, attempts: 1, last_error: message.slice(0, 500), last_attempt_at: new Date().toISOString() },
      { onConflict: 'app_user_id' },
    )
    if (error) throw new Error(`Could not queue RevenueCat deletion: ${error.message}`)
  }
}

export function drainQueue(admin: SupabaseClient, apiKey: string, limit = 20) {
  return drainDeletionQueue({
    apiKey,
    limit,
    async list(n: number) {
      const { data, error } = await admin.from(TABLE).select('app_user_id, attempts').order('created_at', { ascending: true }).limit(n)
      if (error) throw error
      return data ?? []
    },
    async done(id: string) {
      const { error } = await admin.from(TABLE).delete().eq('app_user_id', id)
      if (error) throw error
    },
    async failed(id: string, attempts: number, message: string) {
      const { error } = await admin.from(TABLE)
        .update({ attempts, last_error: message.slice(0, 500), last_attempt_at: new Date().toISOString() })
        .eq('app_user_id', id)
      if (error) throw error
    },
  })
}
