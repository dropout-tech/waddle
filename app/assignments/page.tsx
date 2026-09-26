'use client'
import Link from 'next/link'
import { AuthGuard } from '@/components/auth/auth-guard'
import { AssignmentsCenter } from '@/components/assignments/assignments-center'
import { useI18n } from '@/lib/i18n/react'
export default function AssignmentsPage(){
  const { t } = useI18n()
  return <AuthGuard><main className="h-dvh overflow-y-auto bg-background px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]"><div className="mx-auto max-w-2xl"><Link href="/" className="mb-5 inline-flex min-h-11 items-center text-sm text-muted-foreground">{t('返回工作面板')}</Link><h1 className="mb-6 text-2xl font-semibold">{t('指派任務')}</h1><AssignmentsCenter/></div></main></AuthGuard>
}
