// Browser side of the website subscription (SHOPLINE Payments).
// Contract: docs/billing/2026-10-02-web-billing-contracts.md §1.
//
// This module is only imported by the web-only billing UI
// (components/billing/web-*.tsx, app/billing). It is bundled out of the
// Capacitor static export on purpose: next.config.mjs blanks
// NEXT_PUBLIC_WEB_BILLING_ENABLED for that build, so every
// `process.env.NEXT_PUBLIC_WEB_BILLING_ENABLED === 'true'` branch that
// references this code is dead and tree-shaken (Apple 3.1.1).

import { createClient } from '@/lib/supabase/client'
import { isNative } from '@/lib/platform'
import { en } from '@/lib/i18n/en'
import { dict as webBillingDict } from '@/lib/i18n/dict/web-billing'
import type { Lang } from '@/lib/i18n'

// English strings for this feature live in their own fragment and are merged
// here (not in lib/i18n/dict/billing.ts) so they never reach the Capacitor
// bundle. `en` is the shared mutable dictionary object that translateFor reads.
Object.assign(en, webBillingDict)

/** Build-time flag. Always false in the Capacitor export (see next.config.mjs). */
export const WEB_BILLING_FLAG = process.env.NEXT_PUBLIC_WEB_BILLING_ENABLED === 'true'

/**
 * SHOPLINE front-end keys present at build time. Without them the card form can
 * never load, so the pages show "payments are coming soon" instead of a form that
 * would only fail, and make no request to the (not yet deployed) backend.
 */
export const SLP_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SHOPLINE_CLIENT_KEY && process.env.NEXT_PUBLIC_SHOPLINE_MERCHANT_ID,
)

/** Flag on AND not inside the native shell. */
export function webBillingAvailable(): boolean {
  return WEB_BILLING_FLAG && !isNative()
}

// ── Types (shape of public.my_web_billing(), see foundation migration) ──────

export type WebSubStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'expired'
  | 'refunded'
  | 'incomplete_expired'

export type WebPlan = 'monthly' | 'annual'

export interface WebSubscriptionInfo {
  plan: WebPlan
  status: WebSubStatus
  trial_end: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  needs_customer_action: boolean
  grace_until: string | null
  price_minor: number
}

export interface WebPaymentInfo {
  id: string
  date: string
  amount_minor: number
  status: 'pending' | 'succeeded' | 'failed' | 'unknown'
  refunded_minor: number
  refundable_until: string | null
}

export interface WebBillingSnapshot {
  checkout_available: boolean
  trial_eligible: boolean
  apple_active: boolean
  prices: { monthly: number; annual: number; currency: 'TWD' }
  trial_days: number
  subscription: WebSubscriptionInfo | null
  card: { brand: string | null; last4: string | null } | null
  payments: WebPaymentInfo[]
  open_refund: { status: 'requested' | 'processing' | 'needs_review'; due_by: string } | null
}

export const LIVE_STATUSES: readonly WebSubStatus[] = ['trialing', 'active', 'past_due']

export function isLive(sub: WebSubscriptionInfo | null | undefined): boolean {
  return !!sub && LIVE_STATUSES.includes(sub.status)
}

// ── Errors ──────────────────────────────────────────────────────────────────

export const WEB_BILLING_ERROR_CODES = [
  'unauthorized',
  'disabled',
  'native_not_allowed',
  'apple_active',
  'already_subscribed',
  'trial_used',
  'not_found',
  'not_refundable',
  'payment_in_progress',
  'rate_limited',
  'slp_error',
  'invalid_input',
  'unavailable',
] as const
export type WebBillingErrorCode = (typeof WEB_BILLING_ERROR_CODES)[number] | 'network' | 'sdk' | 'unknown'

export class WebBillingError extends Error {
  code: WebBillingErrorCode
  constructor(code: WebBillingErrorCode, detail?: string) {
    super(detail ?? code)
    this.code = code
  }
}

/** Friendly bilingual message for every contract error code (+ client-side ones). */
export function webBillingErrorMessage(code: string, t: (s: string) => string): string {
  switch (code) {
    case 'unauthorized':
      return t('登入已過期，請重新登入後再試。')
    case 'disabled':
      return t('網站訂閱目前尚未對你的帳號開放。')
    case 'native_not_allowed':
      return t('這項功能只在網頁版提供。')
    case 'apple_active':
      return t('你已經透過 Apple 訂閱 Pro，不需要在網站重複購買。請到 iPhone 的設定管理訂閱。')
    case 'already_subscribed':
      return t('你已經有進行中的訂閱了，請到「設定」→「訂閱」管理。')
    case 'trial_used':
      return t('這個帳號已經用過免費試用，所以沒辦法再試用一次。你還沒有被扣款；頁面已更新，請確認新的付款內容後，再決定要不要付款。')
    case 'not_found':
      return t('找不到這筆資料，請重新整理頁面後再試。')
    case 'not_refundable':
      return t('這筆付款已超過可退款期限，或已經申請過退款。')
    case 'payment_in_progress':
      return t('有一筆付款正在處理中，請等幾分鐘再試。')
    case 'rate_limited':
      return t('操作太頻繁了，請稍等一分鐘再試。')
    case 'slp_error':
      return t('付款服務暫時發生問題，請稍後再試。如果你看到銀行有扣款通知，請聯絡客服。')
    case 'invalid_input':
      return t('送出的資料有誤，請重新整理頁面後再試。')
    case 'unavailable':
      return t('服務暫時無法使用，請稍後再試。')
    case 'network':
      return t('連線失敗，請檢查網路後再試。')
    case 'sdk':
      return t('付款表單載入失敗，請重新整理頁面，或換一個瀏覽器再試。')
    default:
      return t('發生未預期的錯誤，請稍後再試。')
  }
}

export function toWebBillingError(e: unknown): WebBillingError {
  if (e instanceof WebBillingError) return e
  return new WebBillingError('unknown', e instanceof Error ? e.message : undefined)
}

// ── Edge Function / RPC ─────────────────────────────────────────────────────

export type WebBillingAction =
  | { action: 'status' }
  /** expectTrial: true when the page offered a free trial; the server then refuses (`trial_used`) instead of charging if it was already used. */
  | { action: 'start'; plan: WebPlan; paySession: string; locale: Lang; expectTrial?: boolean }
  | { action: 'card_start'; paySession: string; locale: Lang }
  | { action: 'customer_token' }
  | { action: 'pay_now'; paySession: string; locale: Lang }
  | { action: 'cancel' }
  | { action: 'resume' }
  | { action: 'refund'; payment_id: string }

interface OkBody {
  ok: true
  [k: string]: unknown
}

/** Calls the `web-billing` Edge Function; throws WebBillingError on failure. */
export async function callWebBilling<T extends object = Record<string, never>>(
  body: WebBillingAction,
): Promise<T> {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('web-billing', { body })
  if (error) {
    // FunctionsHttpError carries the Response in `context`; our functions answer
    // 4xx/5xx with { ok:false, error:<code> }.
    const ctx = (error as { context?: unknown }).context
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const parsed = (await (ctx as Response).clone().json()) as { error?: string }
        if (parsed?.error) throw new WebBillingError(normalizeCode(parsed.error))
      } catch (inner) {
        if (inner instanceof WebBillingError) throw inner
      }
      throw new WebBillingError('unavailable')
    }
    throw new WebBillingError('network')
  }
  const parsed = data as { ok?: boolean; error?: string } | null
  if (!parsed || parsed.ok !== true) {
    throw new WebBillingError(normalizeCode(parsed?.error))
  }
  return parsed as unknown as T & OkBody
}

function normalizeCode(code: string | undefined): WebBillingErrorCode {
  return (WEB_BILLING_ERROR_CODES as readonly string[]).includes(code ?? '')
    ? (code as WebBillingErrorCode)
    : 'unknown'
}

/** Reads my_web_billing(); the DB function enforces auth (42501 when signed out). */
export async function fetchWebBilling(): Promise<WebBillingSnapshot> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('my_web_billing' as never)
  if (error) {
    if ((error as { code?: string }).code === '42501') throw new WebBillingError('unauthorized')
    // PGRST202 = function not deployed yet.
    throw new WebBillingError('unavailable')
  }
  return data as unknown as WebBillingSnapshot
}

// ── Formatting ──────────────────────────────────────────────────────────────

const TZ = 'Asia/Taipei'

/** NT$150 (minor units are TWD cents). */
export function formatMoney(minor: number): string {
  const v = minor / 100
  return `NT$${Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2)}`
}

/** 2026/10/02 or Oct 2, 2026 — always Taipei calendar day (design §2.3). */
export function formatDate(iso: string | Date, lang: Lang): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    timeZone: TZ,
    year: 'numeric',
    month: lang === 'en' ? 'short' : '2-digit',
    day: lang === 'en' ? 'numeric' : '2-digit',
  }).format(d)
}

/** Refund deadline shown as "<date> 23:59" (refund_deadline is 00:00 of the next day, Taipei). */
export function formatDeadline(iso: string, lang: Lang): string {
  const d = new Date(new Date(iso).getTime() - 60_000)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${formatDate(d, lang)} ${time}`
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000)
}

export function cardLabel(card: { brand: string | null; last4: string | null } | null): string | null {
  if (!card?.last4) return null
  return `${card.brand ? card.brand.toUpperCase() : 'Card'} •••• ${card.last4}`
}

// ── SHOPLINE Payments SDK (CDN, only loaded from /billing/*) ────────────────
// Notes §3. Never installed from npm (no new dependency).

export const SLP_SDK_URL = 'https://cdn.shoplinepayments.com/sdk/v1/payment-web.js'

export interface SlpPayment {
  createPayment: () => Promise<{ paySession?: string; error?: { message?: string; code?: string } }>
  pay: (nextAction: unknown) => Promise<{ error?: { message?: string; code?: string } } | undefined>
  update?: (config: Record<string, unknown>) => Promise<unknown>
  destroy?: () => void
}

type SlpFactory = (config: Record<string, unknown>) => Promise<{ payment?: SlpPayment; error?: { message?: string; code?: string } }>

let sdkPromise: Promise<SlpFactory> | null = null

export function loadSlpSdk(): Promise<SlpFactory> {
  if (typeof window === 'undefined') return Promise.reject(new WebBillingError('sdk'))
  const w = window as unknown as { ShoplinePayments?: SlpFactory }
  if (w.ShoplinePayments) return Promise.resolve(w.ShoplinePayments)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<SlpFactory>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SLP_SDK_URL
    script.async = true
    script.onload = () => {
      if (w.ShoplinePayments) resolve(w.ShoplinePayments)
      else reject(new WebBillingError('sdk'))
    }
    script.onerror = () => reject(new WebBillingError('sdk'))
    document.head.appendChild(script)
  }).catch((e) => {
    sdkPromise = null // allow a retry after a network hiccup
    throw e
  })
  return sdkPromise
}

export interface InitPaymentOptions {
  /** CSS selector of an element that already exists in the DOM. */
  element: string
  /** TWD minor units. */
  amountMinor: number
  lang: Lang
  /** Show the member's saved cards (pay page). */
  customerToken?: string
  /** Offer card binding (start / card pages). */
  bindCard: boolean
}

export async function initSlpPayment(opts: InitPaymentOptions): Promise<SlpPayment> {
  const clientKey = process.env.NEXT_PUBLIC_SHOPLINE_CLIENT_KEY
  const merchantId = process.env.NEXT_PUBLIC_SHOPLINE_MERCHANT_ID
  if (!clientKey || !merchantId) throw new WebBillingError('unavailable')
  const factory = await loadSlpSdk()
  const { payment, error } = await factory({
    clientKey,
    merchantId,
    paymentMethod: 'CreditCard',
    currency: 'TWD',
    amount: opts.amountMinor,
    element: opts.element,
    env: process.env.NEXT_PUBLIC_SHOPLINE_ENV === 'production' ? 'production' : 'sandbox',
    language: opts.lang === 'en' ? 'en' : 'zh-TW',
    countryCode: 'TW',
    ...(opts.customerToken ? { customerToken: opts.customerToken } : {}),
    paymentInstrument: {
      bindCard: {
        enable: opts.bindCard,
        protocol: { switchVisible: true, defaultSwitchStatus: false, mustAccept: true },
        textType: { paymentAgreement: true, subscribeAgreement: true },
      },
    },
  })
  if (error || !payment) throw new WebBillingError('sdk', error?.message)
  return payment
}

/** createPayment() -> paySession, mapping SDK errors to a friendly code. */
export async function createPaySession(payment: SlpPayment): Promise<string> {
  const { paySession, error } = await payment.createPayment()
  if (error || !paySession) throw new WebBillingError('sdk', error?.message)
  return paySession
}

/**
 * payment.pay(nextAction); resolves when done (SDK may navigate away for 3DS).
 * `nextAction` comes from SHOPLINE unchanged and may be a string or an object —
 * it is handed to the SDK as-is. null/undefined means nothing left to do.
 */
export async function runNextAction(payment: SlpPayment, nextAction: unknown): Promise<void> {
  if (nextAction === null || nextAction === undefined || nextAction === '') return
  const res = await payment.pay(nextAction)
  if (res?.error) throw new WebBillingError('slp_error', res.error.message)
}
