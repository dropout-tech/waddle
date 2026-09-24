'use client'
import Link from 'next/link'
import { MembershipPanel } from '@/components/account/membership-panel'
import { useI18n } from '@/lib/i18n/react'
export default function AccountPage(){const {lang}=useI18n();return <main className="mx-auto max-w-2xl space-y-7 px-5 py-8"><Link href="/" className="underline">{lang==='en'?'Back to Huddle':'返回 Huddle'}</Link><h1 className="text-3xl font-semibold">{lang==='en'?'Membership & referrals':'會員方案與推薦'}</h1><MembershipPanel/></main>}
