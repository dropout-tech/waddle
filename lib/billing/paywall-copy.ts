import type { PaywallPlan, PlanTrial } from './paywall-state'

/** `t` from lib/i18n: the Traditional Chinese text is the key. */
type Translate = (text: string, vars?: Record<string, string | number>) => string

// [singular, plural] source strings per unit; English picks "1 week" vs "2 weeks" through the dictionary.
const LENGTH: Record<PlanTrial['unit'], [string, string]> = {
  DAY: ['1 天', '{count} 天'],
  WEEK: ['1 週', '{count} 週'],
  MONTH: ['1 個月', '{count} 個月'],
  YEAR: ['1 年', '{count} 年'],
}

/** "2 週" / "2 weeks" — the trial length exactly as the store reports it, never converted. */
export function trialLength(trial: PlanTrial, t: Translate): string {
  const [one, many] = LENGTH[trial.unit]
  return trial.count === 1 ? t(one) : t(many, { count: trial.count })
}

/** "NT$149.00／月" — the store's own price string with the store's own billing period. */
export function planPrice(plan: PaywallPlan, t: Translate): string {
  return plan.period === 'month' ? t('{price}／月', { price: plan.localizedPrice }) : t('{price}／年', { price: plan.localizedPrice })
}

/**
 * Everything the card says about one plan. With a free trial the user is
 * eligible for, every line states the trial length and the price charged
 * after it; without one it is the plain price screen.
 */
export function planCopy(plan: PaywallPlan, t: Translate) {
  const price = planPrice(plan, t)
  const name = plan.period === 'month' ? t('月繳') : t('年繳')
  if (!plan.trial) {
    return {
      name,
      price,
      detail: plan.period === 'month' ? t('每月自動續訂') : t('每年自動續訂'),
      cta: t('訂閱 · {price}', { price }),
      terms: t('訂閱到期前 24 小時內會自動續訂並向你的 Apple 帳號扣款，除非你在到期前至少 24 小時取消。確認購買時，款項會向你的 Apple 帳號收取。你可以隨時到 Apple ID 的「訂閱」設定管理或取消。'),
    }
  }
  const length = trialLength(plan.trial, t)
  return {
    name,
    price,
    detail: t('前 {length}免費，之後 {price}', { length, price }),
    cta: t('開始 {length}免費試用', { length }),
    terms: t('免費試用 {length}。試用結束後會自動以 {price} 向你的 Apple 帳號扣款並開始訂閱，除非你在試用結束前至少 24 小時取消。之後每期到期前 24 小時內自動續訂。你可以隨時到 Apple ID 的「訂閱」設定管理或取消。', { length, price }),
  }
}
