'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useI18n } from '@/lib/i18n/react'
import {
  initSlpPayment,
  toWebBillingError,
  webBillingErrorMessage,
  type SlpPayment,
} from '@/lib/billing/web-billing-client'
import { BillingButton, Notice } from './billing-ui'

const ELEMENT_ID = 'slp-payment-container'

/**
 * Mounts the SHOPLINE card form into #slp-payment-container. The card number
 * only ever lives inside SLP's own fields; the parent reads the SDK handle from
 * `paymentRef` and calls createPayment() when the member confirms.
 */
export function SlpPaymentForm({
  amountMinor,
  bindCard,
  customerToken,
  paymentRef,
  onReadyChange,
}: {
  amountMinor: number
  bindCard: boolean
  customerToken?: string
  paymentRef: MutableRefObject<SlpPayment | null>
  onReadyChange?: (ready: boolean) => void
}) {
  const { lang, t } = useI18n()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [code, setCode] = useState('sdk')
  const [attempt, setAttempt] = useState(0)
  const cb = useRef(onReadyChange)
  useEffect(() => {
    cb.current = onReadyChange
  })

  useEffect(() => {
    let alive = true
    setState('loading')
    cb.current?.(false)
    initSlpPayment({ element: `#${ELEMENT_ID}`, amountMinor, lang, bindCard, customerToken })
      .then((p) => {
        if (!alive) {
          p.destroy?.()
          return
        }
        paymentRef.current = p
        setState('ready')
        cb.current?.(true)
      })
      .catch((e) => {
        if (!alive) return
        setCode(toWebBillingError(e).code)
        setState('error')
      })
    return () => {
      alive = false
      paymentRef.current?.destroy?.()
      paymentRef.current = null
    }
  }, [amountMinor, lang, bindCard, customerToken, paymentRef, attempt])

  return (
    <div>
      {state === 'error' && (
        <div className="space-y-3">
          <Notice tone="error" testId="slp-error">{webBillingErrorMessage(code, t)}</Notice>
          <BillingButton variant="outline" onClick={() => setAttempt((n) => n + 1)}>{t('重新載入付款表單')}</BillingButton>
        </div>
      )}
      {state === 'loading' && <p className="py-3 text-sm text-muted-foreground" role="status">{t('付款表單載入中…')}</p>}
      <div id={ELEMENT_ID} data-testid="slp-container" className={state === 'error' ? 'hidden' : 'min-h-24'} />
    </div>
  )
}
