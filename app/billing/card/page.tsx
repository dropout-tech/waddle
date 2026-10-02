import type { Metadata } from 'next'
import { BillingRoute } from '@/components/billing/billing-route'

export const metadata: Metadata = { title: 'Huddle', robots: { index: false, follow: false } }

export default function BillingCardPage() {
  return <BillingRoute view="card" />
}
