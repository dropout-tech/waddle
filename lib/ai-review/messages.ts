import type { Lang } from '@/lib/i18n'
import type { AiQuota } from './api'
import { clockTime, formatResetDate } from './format'

type T = (text: string, vars?: Record<string, string | number>) => string

/**
 * Plain-language text for every error code in docs/features/ai-review-design.md
 * §4.4 (plus the client-side NETWORK / TIMEOUT / BAD_RESPONSE cases). Returns
 * a string already translated by the caller's `t` (the hook-bound one, so the
 * text follows a language switch while it is on screen).
 *
 * Codes the UI handles itself and never shows as text: CONSENT_REQUIRED (opens
 * the consent screen) and NO_DATA (the penguin empty state).
 */
export function aiErrorMessage(
  code: string,
  quota: AiQuota | null,
  t: T,
  lang: Lang,
): string {
  const resets = quota?.resets_on ? formatResetDate(quota.resets_on, lang) : ''
  switch (code) {
    case 'MONTHLY_LIMIT':
      return resets
        ? t('本月的 AI 回顧份數已用完。下次重置日：{date}。', { date: resets })
        : t('本月的 AI 回顧份數已用完。下個月 1 日（台北時間）重新計算。')
    case 'RATE_LIMIT': {
      const at = quota?.hourly_retry_at ? clockTime(quota.hourly_retry_at) : ''
      return at
        ? t('一小時內試了太多次，請 {time} 之後再試。', { time: at })
        : t('一小時內試了太多次，請稍後再試。')
    }
    case 'ATTEMPT_LIMIT':
      return resets
        ? t('本月的嘗試次數已達上限（失敗也會計入）。下次重置日：{date}。', { date: resets })
        : t('本月的嘗試次數已達上限（失敗也會計入）。下個月 1 日（台北時間）重新計算。')
    case 'IN_PROGRESS':
      return t('已經有一份報告正在產生中，請等它完成。')
    case 'DUPLICATE_REQUEST':
      return t('這個請求已經送出過了，請重新按一次「產生報告」。')
    case 'CONSENT_CHANGED':
      return t('產生途中你的同意設定有變動，這次沒有存檔。請再按一次「產生報告」。')
    case 'CONSENT_VERSION_MISMATCH':
      return t('同意畫面的版本已更新，請重新整理頁面後再試。')
    case 'MATERIAL_BLOCKED':
      return t('這段期間的內容裡含有圖片編碼（例如貼進便條紙的圖片資料），為了安全，這次整份都沒有送出，也沒有扣掉你的份數。請改選其他期間，或先清掉那段內容。')
    case 'GENERATION_FAILED':
      return t('這次沒能完成報告，沒有扣掉你的份數。請稍後再試。')
    case 'GENERATION_TIMEOUT':
    case 'TIMEOUT':
      return t('等了太久，這次沒有產生報告，也沒有扣掉你的份數。請稍後再試。')
    case 'AI_NOT_CONFIGURED':
      return t('AI 回顧目前沒有開放。')
    case 'SERVICE_PAUSED':
      return t('AI 回顧今天的使用量很高，暫時停止服務。請明天再試。')
    case 'DATABASE_ERROR':
      return t('暫時讀不到你的紀錄，這次沒有扣掉你的份數。請稍後再試。')
    case 'UNAUTHORIZED':
      return t('登入已過期，請重新登入。')
    case 'ACCOUNT_SUSPENDED':
      return t('帳號已停用，請聯絡客服。')
    case 'ANONYMOUS_NOT_ALLOWED':
      return t('訪客帳號無法使用 AI 回顧，請先登入正式帳號。')
    case 'NETWORK':
      return t('連不上伺服器，請檢查網路後再試。')
    default:
      // INVALID_INPUT, INPUT_TOO_LARGE, METHOD_NOT_ALLOWED, BAD_RESPONSE, HTTP_ERROR, unknown
      return t('這次請求沒有成功，請重新整理頁面後再試。')
  }
}
