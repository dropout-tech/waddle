'use client'
import Link from 'next/link'
import { AuthGuard } from '@/components/auth/auth-guard'
import { OrgCenter } from '@/components/org/org-center'
import { useI18n } from '@/lib/i18n/react'

// Static-export friendly: everything is client-side RPC (no server features).
export default function OrgPage() {
  const { t } = useI18n()
  return (
    <AuthGuard>
      <main className="h-dvh overflow-y-auto bg-background px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">{t('返回工作面板')}</Link>
            <span className="text-muted-foreground">·</span>
            <Link href="/assignments" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">{t('指派任務')}</Link>
          </div>
          <h1 className="mb-6 text-2xl font-semibold">{t('組織')}</h1>
          <OrgCenter />
        </div>
      </main>
    </AuthGuard>
  )
}
