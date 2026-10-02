// Website subscription e-mails (module C): templates, Resend sending, queue runner.
// Contract: docs/billing/2026-10-02-web-billing-contracts.md §2 (queue payloads), §4 (this API).
// Plain JS, no dependencies, no I/O of its own: runs unchanged in Deno (Edge Function)
// and Node (tests). fetch / database access are injected by the caller.
//
// One mail = Traditional Chinese on top, English below (design §5.4).
// Money is integer minor units (TWD x 100) -> "NT$990". Instants are ISO-8601
// strings (UTC) and are shown as Asia/Taipei dates "YYYY/MM/DD".
// Every payload-derived string is HTML-escaped before it reaches the HTML.

// Same facts as lib/legal/operator.ts (a test keeps them identical).
export const SUPPORT_PHONE = '0988-493-026'
export const SUPPORT_EMAIL = 'hi@lazy72.com'

const INK = '#292b24'
const PAPER = '#f6f3e9'
const YELLOW = '#edc747'
const ORANGE = '#cf5731'
const MUTED = '#5b5e50'

const RESEND_URL = 'https://api.resend.com/emails'
const SEND_TIMEOUT_MS = 10_000

// ── formatting helpers ──────────────────────────────────────────────────────

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 99000 -> "NT$990"; 15050 -> "NT$150.50". */
export function formatMoney(minor) {
  if (typeof minor !== 'number' || !Number.isFinite(minor) || minor < 0) throw new Error('invalid payload: amount_minor')
  const whole = Math.trunc(minor / 100)
  const cents = Math.round(minor - whole * 100)
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return cents === 0 ? `NT$${grouped}` : `NT$${grouped}.${String(cents).padStart(2, '0')}`
}

function parseInstant(iso, field) {
  const d = iso instanceof Date ? iso : typeof iso === 'string' || typeof iso === 'number' ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) throw new Error(`invalid payload: ${field}`)
  return d
}

// Taiwan has no daylight saving time: Asia/Taipei is always UTC+8.
function taipeiParts(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return { y: t.getUTCFullYear(), mo: p(t.getUTCMonth() + 1), d: p(t.getUTCDate()), h: p(t.getUTCHours()), mi: p(t.getUTCMinutes()) }
}

/** ISO instant -> "YYYY/MM/DD" in Taipei time. */
export function formatDate(iso, field = 'date') {
  const x = taipeiParts(parseInstant(iso, field))
  return `${x.y}/${x.mo}/${x.d}`
}

/** Taipei calendar date of the day before `iso` (for "cancel before the day before the charge"). */
function formatDayBefore(iso, field) {
  return formatDate(new Date(parseInstant(iso, field).getTime() - 24 * 3600 * 1000), field)
}

/** Refund deadline is an exclusive instant (next day 00:00): show the last valid minute. */
function formatDeadline(iso) {
  const x = taipeiParts(new Date(parseInstant(iso, 'refund_deadline').getTime() - 1000))
  return `${x.y}/${x.mo}/${x.d} ${x.h}:${x.mi}`
}

const PLAN_ZH = { monthly: '月繳', annual: '年繳' }
const PLAN_EN = { monthly: 'monthly', annual: 'annual' }

function need(payload, field) {
  if (!payload || typeof payload !== 'object' || payload[field] === undefined || payload[field] === null || payload[field] === '') {
    throw new Error(`invalid payload: ${field}`)
  }
  return payload[field]
}

function cardLine(payload) {
  const last4 = payload?.card_last4
  if (typeof last4 !== 'string' || !/^[0-9]{4}$/.test(last4)) return null
  const brand = typeof payload?.card_brand === 'string' && payload.card_brand.trim() ? payload.card_brand.trim() : null
  return { zh: `${brand ? `${brand} ` : ''}信用卡，末四碼 ${last4}`, en: `${brand ? `${brand} ` : ''}card ending in ${last4}` }
}

function cleanSiteUrl(siteUrl) {
  if (typeof siteUrl !== 'string' || !/^https?:\/\/[^\s]+$/.test(siteUrl)) throw new Error('invalid siteUrl')
  return siteUrl.replace(/\/+$/, '')
}

// ── per-kind content ────────────────────────────────────────────────────────
// Each builder returns { subjectZh, subjectEn, zh, en } where zh / en are
// { title, paras: string[], rows: [label, value][], notes: string[], buttons: [{label, url}] }.

const CANCEL_HOW_ZH = (links) =>
  `想取消：登入 Huddle →「設定」→「訂閱」→「取消續訂」，線上即可完成（${links.settings}）；也可以來電 ${SUPPORT_PHONE} 請我們代為取消。`
const CANCEL_HOW_EN = (links) =>
  `To cancel: sign in to Huddle, go to Settings → Subscription → Cancel renewal and it takes effect right away (${links.settings}). You can also call ${SUPPORT_PHONE} and we will cancel for you.`

function buildTrialEnding(p, links) {
  const amount = formatMoney(need(p, 'amount_minor'))
  const trialEnd = formatDate(need(p, 'trial_end'), 'trial_end')
  const chargeAt = need(p, 'first_charge_at')
  const chargeDate = formatDate(chargeAt, 'first_charge_at')
  const cancelBy = formatDayBefore(chargeAt, 'first_charge_at')
  const plan = String(need(p, 'plan'))
  const card = cardLine(p)
  return {
    subjectZh: `Pro 免費試用即將結束，${chargeDate} 將扣款 ${amount}`,
    subjectEn: `Your Huddle Pro trial is ending, ${amount} will be charged on ${chargeDate}`,
    zh: {
      title: '免費試用即將結束',
      paras: [
        `你的 Huddle Pro 免費試用將在 ${trialEnd} 結束。如果不取消，我們會在 ${chargeDate} 自動扣款第一期費用 ${amount}，之後依方案自動續訂。`,
        `如果不想被扣款，請在 ${cancelBy} 結束前取消。試用期內取消就不會被扣款，Pro 仍可使用到試用結束。`,
      ],
      rows: [
        ['方案', `Pro ${PLAN_ZH[plan] ?? plan}`],
        ['扣款日', chargeDate],
        ['扣款金額', `${amount}，已含稅（如適用），無其他手續費`],
        ...(card ? [['扣款卡片', card.zh]] : []),
      ],
      notes: [CANCEL_HOW_ZH(links)],
      buttons: [{ label: '管理或取消訂閱', url: links.settings }],
    },
    en: {
      title: 'Your free trial is ending soon',
      paras: [
        `Your Huddle Pro free trial ends on ${trialEnd}. Unless you cancel, we will automatically charge the first payment of ${amount} on ${chargeDate}, and the subscription will then renew automatically.`,
        `If you do not want to be charged, please cancel before the end of ${cancelBy}. If you cancel during the trial you will not be charged, and Pro stays available until the trial ends.`,
      ],
      rows: [
        ['Plan', `Pro (${PLAN_EN[plan] ?? plan})`],
        ['Charge date', chargeDate],
        ['Amount', `${amount}, tax included where applicable, no other fees`],
        ...(card ? [['Card', card.en]] : []),
      ],
      notes: [CANCEL_HOW_EN(links)],
      buttons: [{ label: 'Manage or cancel subscription', url: links.settings }],
    },
  }
}

function buildRenewalReminder(p, links) {
  const amount = formatMoney(need(p, 'amount_minor'))
  const renewsAt = need(p, 'renews_at')
  const renewDate = formatDate(renewsAt, 'renews_at')
  const cancelBy = formatDayBefore(renewsAt, 'renews_at')
  const card = cardLine(p)
  return {
    subjectZh: `Pro 年繳方案將於 ${renewDate} 續訂，扣款 ${amount}`,
    subjectEn: `Your Huddle Pro annual plan renews on ${renewDate} (${amount})`,
    zh: {
      title: '年繳方案即將續訂',
      paras: [
        `你的 Huddle Pro 年繳方案將在 ${renewDate} 自動續訂，屆時會向你的信用卡扣款 ${amount}。`,
        `如果不想續訂，請在 ${cancelBy} 結束前取消續訂；取消後不會再扣款，Pro 可以使用到目前已付費的期間結束。`,
      ],
      rows: [
        ['方案', 'Pro 年繳'],
        ['續訂日', renewDate],
        ['扣款金額', `${amount}，已含稅（如適用），無其他手續費`],
        ...(card ? [['扣款卡片', card.zh]] : []),
      ],
      notes: [CANCEL_HOW_ZH(links), '年繳方案續訂扣款後 7 天內，可以申請全額退款，不收手續費。'],
      buttons: [{ label: '管理或取消訂閱', url: links.settings }],
    },
    en: {
      title: 'Your annual plan renews soon',
      paras: [
        `Your Huddle Pro annual plan renews automatically on ${renewDate}, and ${amount} will be charged to your card.`,
        `If you do not want to renew, please cancel before the end of ${cancelBy}. After you cancel you will not be charged again, and Pro stays available until the end of the period you already paid for.`,
      ],
      rows: [
        ['Plan', 'Pro (annual)'],
        ['Renewal date', renewDate],
        ['Amount', `${amount}, tax included where applicable, no other fees`],
        ...(card ? [['Card', card.en]] : []),
      ],
      notes: [CANCEL_HOW_EN(links), 'You can request a full refund within 7 days after an annual renewal charge, with no fee.'],
      buttons: [{ label: 'Manage or cancel subscription', url: links.settings }],
    },
  }
}

function buildReceipt(p, links) {
  const amount = formatMoney(need(p, 'amount_minor'))
  const plan = String(need(p, 'plan'))
  const paidDate = formatDate(need(p, 'paid_at'), 'paid_at')
  const periodStart = formatDate(need(p, 'period_start'), 'period_start')
  const periodEnd = formatDate(need(p, 'period_end'), 'period_end')
  const card = cardLine(p)
  const ref = typeof p.reference_order_id === 'string' && p.reference_order_id ? p.reference_order_id : null
  const refundBy = p.refund_deadline ? formatDeadline(p.refund_deadline) : null
  return {
    subjectZh: `Pro 付款收據：${amount}（${paidDate}）`,
    subjectEn: `Your Huddle Pro payment receipt: ${amount} (${paidDate})`,
    zh: {
      title: '付款成功，這是你的電子收據',
      paras: [`謝謝你訂閱 Huddle Pro。我們已收到你的付款 ${amount}。`],
      rows: [
        ['方案', `Pro ${PLAN_ZH[plan] ?? plan}`],
        ['付款日期', paidDate],
        ['付款金額', `${amount}，已含稅（如適用），無其他手續費`],
        ['服務期間', `${periodStart} – ${periodEnd}`],
        ...(card ? [['付款卡片', card.zh]] : []),
        ...(ref ? [['訂單編號', ref]] : []),
      ],
      notes: [
        ...(refundBy ? [`這筆款項可在 ${refundBy} 前申請 7 天內全額退款：登入 Huddle →「設定」→「訂閱」→「申請退款」，或來電 ${SUPPORT_PHONE}。`] : []),
        CANCEL_HOW_ZH(links),
      ],
      buttons: [{ label: '查看我的訂閱', url: links.settings }],
    },
    en: {
      title: 'Payment received, here is your receipt',
      paras: [`Thank you for subscribing to Huddle Pro. We have received your payment of ${amount}.`],
      rows: [
        ['Plan', `Pro (${PLAN_EN[plan] ?? plan})`],
        ['Payment date', paidDate],
        ['Amount', `${amount}, tax included where applicable, no other fees`],
        ['Service period', `${periodStart} – ${periodEnd}`],
        ...(card ? [['Card', card.en]] : []),
        ...(ref ? [['Order number', ref]] : []),
      ],
      notes: [
        ...(refundBy ? [`You can request a full refund for this payment until ${refundBy} (Taipei time): sign in, go to Settings → Subscription → Request refund, or call ${SUPPORT_PHONE}.`] : []),
        CANCEL_HOW_EN(links),
      ],
      buttons: [{ label: 'View my subscription', url: links.settings }],
    },
  }
}

function buildPaymentFailed(p, links) {
  const amount = formatMoney(need(p, 'amount_minor'))
  const plan = String(need(p, 'plan'))
  const failedDate = formatDate(need(p, 'failed_at'), 'failed_at')
  const graceDate = formatDate(need(p, 'grace_until'), 'grace_until')
  const retry = p.next_retry_at ? formatDate(p.next_retry_at, 'next_retry_at') : null
  return {
    subjectZh: 'Pro 續訂扣款失敗，請更新付款方式',
    subjectEn: 'Your Huddle Pro renewal payment failed, please update your payment method',
    zh: {
      title: '這次續訂扣款沒有成功',
      paras: [
        `我們在 ${failedDate} 嘗試扣款 ${amount}（Pro ${PLAN_ZH[plan] ?? plan}）時沒有成功，常見原因是卡片過期、額度不足或銀行拒絕。`,
        `Pro 到 ${graceDate} 前都照常可用。${retry ? `我們會在 7 天內最多再嘗試扣款 3 次（下一次約 ${retry}）。` : '我們會在 7 天內最多再嘗試扣款 3 次。'}你也可以更換信用卡，或現在就回網站完成付款。`,
        `${graceDate} 後如果仍無法扣款，訂閱會自動結束、帳號回到免費方案；我們不會向你追收這一期的費用，你的資料也不會被刪除。`,
      ],
      rows: [
        ['方案', `Pro ${PLAN_ZH[plan] ?? plan}`],
        ['這期金額', amount],
        ['Pro 可用至', graceDate],
      ],
      notes: [`需要協助請來電 ${SUPPORT_PHONE}。`],
      buttons: [{ label: '立即付款', url: links.pay }, { label: '更換信用卡', url: links.card }],
    },
    en: {
      title: 'Your renewal payment did not go through',
      paras: [
        `We tried to charge ${amount} (Pro ${PLAN_EN[plan] ?? plan}) on ${failedDate} and it did not succeed. Common causes are an expired card, insufficient limit or a decline by the bank.`,
        `Pro stays available until ${graceDate}. ${retry ? `We will retry up to 3 more times within 7 days (next attempt around ${retry}).` : 'We will retry up to 3 more times within 7 days.'} You can also change your card, or pay now on the website.`,
        `If we still cannot charge your card after ${graceDate}, the subscription ends automatically and your account returns to the free plan. We will not collect this period's fee from you, and your data will not be deleted.`,
      ],
      rows: [
        ['Plan', `Pro (${PLAN_EN[plan] ?? plan})`],
        ['Amount due', amount],
        ['Pro available until', graceDate],
      ],
      notes: [`Need help? Call ${SUPPORT_PHONE}.`],
      buttons: [{ label: 'Pay now', url: links.pay }, { label: 'Change card', url: links.card }],
    },
  }
}

function buildActionRequired(p, links) {
  const amount = formatMoney(need(p, 'amount_minor'))
  const plan = String(need(p, 'plan'))
  const graceDate = formatDate(need(p, 'grace_until'), 'grace_until')
  return {
    subjectZh: '請回 Huddle 網站完成 Pro 付款',
    subjectEn: 'Please complete your Huddle Pro payment on the website',
    zh: {
      title: '需要你回網站完成付款',
      paras: [
        `這次續訂扣款（${amount}，Pro ${PLAN_ZH[plan] ?? plan}）需要你本人在網站上完成銀行驗證（例如簡訊驗證碼），我們無法在你不在場時自動完成，也不會自動重複扣款。`,
        `請在 ${graceDate} 前回到網站付款；Pro 到 ${graceDate} 前都照常可用。你也可以改用另一張信用卡。`,
        `${graceDate} 後如果仍未完成，訂閱會自動結束、帳號回到免費方案；我們不會向你追收這一期的費用，你的資料也不會被刪除。`,
      ],
      rows: [
        ['方案', `Pro ${PLAN_ZH[plan] ?? plan}`],
        ['這期金額', amount],
        ['請在此日期前付款', graceDate],
      ],
      notes: [`需要協助請來電 ${SUPPORT_PHONE}。`],
      buttons: [{ label: '前往付款', url: links.pay }, { label: '更換信用卡', url: links.card }],
    },
    en: {
      title: 'Action needed: please complete your payment',
      paras: [
        `This renewal payment (${amount}, Pro ${PLAN_EN[plan] ?? plan}) needs you to complete a bank verification on the website (for example an SMS code). We cannot finish it automatically while you are away, and we will not keep retrying the charge.`,
        `Please return to the website and pay before ${graceDate}; Pro stays available until then. You can also use a different card.`,
        `If the payment is not completed by then, the subscription ends automatically and your account returns to the free plan. We will not collect this period's fee from you, and your data will not be deleted.`,
      ],
      rows: [
        ['Plan', `Pro (${PLAN_EN[plan] ?? plan})`],
        ['Amount due', amount],
        ['Please pay before', graceDate],
      ],
      notes: [`Need help? Call ${SUPPORT_PHONE}.`],
      buttons: [{ label: 'Go to payment', url: links.pay }, { label: 'Change card', url: links.card }],
    },
  }
}

function buildRefundDone(p, links) {
  const amount = formatMoney(need(p, 'amount_minor'))
  const refundedDate = formatDate(need(p, 'refunded_at'), 'refunded_at')
  const ref = typeof p.reference_order_id === 'string' && p.reference_order_id ? p.reference_order_id : null
  return {
    subjectZh: `退款已完成：${amount}`,
    subjectEn: `Your Huddle refund is complete: ${amount}`,
    zh: {
      title: '退款已完成',
      paras: [
        `我們已在 ${refundedDate} 完成退款 ${amount}，款項會退回你原本付款的信用卡。款項何時出現在信用卡帳單上，依發卡銀行的作業時間而定。`,
        '退款完成後，該期的 Pro 已停止，帳號回到免費方案，你的資料不會被刪除。之後想再使用 Pro，重新購買即可。',
      ],
      rows: [['退款金額', amount], ['退款日期', refundedDate], ...(ref ? [['原付款訂單編號', ref]] : [])],
      notes: [`如有疑問請來電 ${SUPPORT_PHONE}。`],
      buttons: [],
    },
    en: {
      title: 'Your refund is complete',
      paras: [
        `We completed your refund of ${amount} on ${refundedDate}. It goes back to the credit card you paid with; when it appears on your statement depends on your card issuer.`,
        'After the refund, Pro for that period has stopped and your account is back on the free plan. Your data has not been deleted. You can buy Pro again at any time.',
      ],
      rows: [['Refund amount', amount], ['Refund date', refundedDate], ...(ref ? [['Original order number', ref]] : [])],
      notes: [`Questions? Call ${SUPPORT_PHONE}.`],
      buttons: [],
    },
  }
}

function buildCanceled(p, links) {
  const plan = String(need(p, 'plan'))
  const until = formatDate(need(p, 'access_until'), 'access_until')
  const reason = String(p.reason ?? 'admin')
  const planZh = PLAN_ZH[plan] ?? plan
  const planEn = PLAN_EN[plan] ?? plan
  if (reason === 'grace_exhausted') {
    return {
      subjectZh: 'Pro 訂閱已結束',
      subjectEn: 'Your Huddle Pro subscription has ended',
      zh: {
        title: '你的 Pro 訂閱已結束',
        paras: [
          `因為 7 天內仍無法成功扣款，你的 Huddle Pro ${planZh}訂閱已在 ${until} 結束，帳號回到免費方案。`,
          '我們不會向你追收這一期的費用，你的資料也不會被刪除。之後想再使用 Pro，隨時可以重新購買。',
        ],
        rows: [['方案', `Pro ${planZh}`], ['結束日期', until]],
        notes: [`如有疑問請來電 ${SUPPORT_PHONE}。`],
        buttons: [{ label: '前往設定', url: links.settings }],
      },
      en: {
        title: 'Your Pro subscription has ended',
        paras: [
          `We could not charge your card within 7 days, so your Huddle Pro (${planEn}) subscription ended on ${until} and your account is back on the free plan.`,
          'We will not collect this period\'s fee from you, and your data has not been deleted. You can buy Pro again at any time.',
        ],
        rows: [['Plan', `Pro (${planEn})`], ['Ended on', until]],
        notes: [`Questions? Call ${SUPPORT_PHONE}.`],
        buttons: [{ label: 'Go to settings', url: links.settings }],
      },
    }
  }
  if (reason === 'refund') {
    return {
      subjectZh: 'Pro 訂閱已結束（退款）',
      subjectEn: 'Your Huddle Pro subscription has ended (refund)',
      zh: {
        title: '你的 Pro 訂閱已結束',
        paras: ['因為退款，你的 Huddle Pro 訂閱已結束，不會再扣款，帳號回到免費方案，你的資料不會被刪除。'],
        rows: [['方案', `Pro ${planZh}`], ['結束日期', until]],
        notes: [`如有疑問請來電 ${SUPPORT_PHONE}。`],
        buttons: [],
      },
      en: {
        title: 'Your Pro subscription has ended',
        paras: ['Because of the refund, your Huddle Pro subscription has ended. You will not be charged again, your account is back on the free plan and your data has not been deleted.'],
        rows: [['Plan', `Pro (${planEn})`], ['Ended on', until]],
        notes: [`Questions? Call ${SUPPORT_PHONE}.`],
        buttons: [],
      },
    }
  }
  const byUser = reason === 'user'
  return {
    subjectZh: 'Pro 訂閱已取消，不會再扣款',
    subjectEn: 'Your Huddle Pro subscription is canceled, no further charges',
    zh: {
      title: byUser ? '已取消續訂' : '你的 Pro 訂閱已取消',
      paras: [
        byUser ? '我們已收到你的取消，Huddle Pro 不會再續訂，也不會再扣款。' : '你的 Huddle Pro 訂閱已經取消，不會再續訂，也不會再扣款。',
        `Pro 可以使用到 ${until}，之後帳號回到免費方案，你的資料不會被刪除。`,
        `改變心意的話，在 ${until} 前可以到「設定」→「訂閱」恢復續訂。`,
      ],
      rows: [['方案', `Pro ${planZh}`], ['Pro 可用至', until]],
      notes: [`如果這不是你的操作，請盡快來電 ${SUPPORT_PHONE}。`],
      buttons: [{ label: '查看我的訂閱', url: links.settings }],
    },
    en: {
      title: byUser ? 'Renewal canceled' : 'Your Pro subscription is canceled',
      paras: [
        byUser ? 'We received your cancellation. Huddle Pro will not renew and you will not be charged again.' : 'Your Huddle Pro subscription has been canceled. It will not renew and you will not be charged again.',
        `Pro stays available until ${until}, after which your account returns to the free plan. Your data will not be deleted.`,
        `If you change your mind, you can resume the subscription under Settings → Subscription before ${until}.`,
      ],
      rows: [['Plan', `Pro (${planEn})`], ['Pro available until', until]],
      notes: [`If you did not do this, please call ${SUPPORT_PHONE} as soon as possible.`],
      buttons: [{ label: 'View my subscription', url: links.settings }],
    },
  }
}

const BUILDERS = {
  receipt: buildReceipt,
  trial_ending: buildTrialEnding,
  renewal_reminder: buildRenewalReminder,
  payment_failed: buildPaymentFailed,
  action_required: buildActionRequired,
  refund_done: buildRefundDone,
  canceled: buildCanceled,
}

// ── rendering ───────────────────────────────────────────────────────────────

const FOOTER = {
  zh: `你收到這封信，是因為你的 Huddle 帳號有 Pro 訂閱。帳務問題可直接回覆這封信（${SUPPORT_EMAIL}），或來電 ${SUPPORT_PHONE}。`,
  en: `You are receiving this because your Huddle account has a Pro subscription. For billing questions, reply to this e-mail (${SUPPORT_EMAIL}) or call ${SUPPORT_PHONE}.`,
}

function sectionHtml(lang, s) {
  const font = lang === 'zh'
    ? `'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif`
    : `'Helvetica Neue',Helvetica,Arial,sans-serif`
  const rows = s.rows.map(([k, v]) =>
    `<tr><td style="padding:7px 12px 7px 0;color:${MUTED};font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td>` +
    `<td style="padding:7px 0;font-size:15px;font-weight:700;color:${INK};vertical-align:top">${escapeHtml(v)}</td></tr>`).join('')
  const paras = s.paras.map((t) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${INK}">${escapeHtml(t)}</p>`).join('')
  const notes = s.notes.map((t) => `<p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:${MUTED}">${escapeHtml(t)}</p>`).join('')
  const buttons = s.buttons.map((b) =>
    `<a href="${escapeHtml(b.url)}" style="display:inline-block;margin:0 10px 10px 0;padding:11px 20px;background:${INK};color:${PAPER};text-decoration:none;font-size:15px;font-weight:700;border-radius:4px">${escapeHtml(b.label)}</a>`).join('')
  return `<div lang="${lang === 'zh' ? 'zh-Hant' : 'en'}" style="font-family:${font}">` +
    `<h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;color:${INK}">${escapeHtml(s.title)}</h1>` +
    paras +
    (rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;border-top:2px solid ${INK};border-bottom:2px solid ${INK};width:100%">${rows}</table>` : '') +
    (buttons ? `<div style="margin:4px 0 14px">${buttons}</div>` : '') +
    notes +
    `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED}">${escapeHtml(FOOTER[lang])}</p>` +
    `</div>`
}

function sectionText(s) {
  const out = [s.title, '', ...s.paras.flatMap((t) => [t, ''])]
  if (s.rows.length) out.push(...s.rows.map(([k, v]) => `${k}: ${v}`), '')
  if (s.buttons.length) out.push(...s.buttons.map((b) => `${b.label}: ${b.url}`), '')
  if (s.notes.length) out.push(...s.notes.flatMap((t) => [t, '']))
  return out
}

/**
 * Render one queued mail. Returns { subject, html, text }, or null when this
 * kind is not sent (price_change / service_notice are P7; unknown kinds too).
 * Throws Error('invalid payload: <field>') when a required payload field is
 * missing or malformed (the queue runner then counts a failed attempt).
 */
export function renderEmail(kind, payload, { siteUrl } = {}) {
  const build = BUILDERS[kind]
  if (!build) return null
  const base = cleanSiteUrl(siteUrl)
  const links = { settings: `${base}/?settings=subscription`, pay: `${base}/billing/pay`, card: `${base}/billing/card` }
  const c = build(payload ?? {}, links)
  const subject = `【Huddle】${c.subjectZh} | ${c.subjectEn}`
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${PAPER}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid ${INK};border-radius:6px">` +
    `<tr><td style="padding:14px 24px;background:${YELLOW};border-bottom:2px solid ${INK};border-radius:4px 4px 0 0;font-family:Arial,sans-serif;font-size:20px;font-weight:900;letter-spacing:-0.02em;color:${INK}">Huddle</td></tr>` +
    `<tr><td style="padding:24px">${sectionHtml('zh', c.zh)}` +
    `<hr style="border:0;border-top:2px dashed ${ORANGE};margin:26px 0">${sectionHtml('en', c.en)}</td></tr>` +
    `</table></td></tr></table></body></html>`
  const text = [...sectionText(c.zh), '------------------------------', '', ...sectionText(c.en), '--', FOOTER.zh, FOOTER.en].join('\n')
  return { subject, html, text }
}

// ── sending (Resend) ────────────────────────────────────────────────────────

function shortError(body, status) {
  let msg = ''
  try {
    const j = JSON.parse(body)
    msg = [j?.name, j?.message].filter((x) => typeof x === 'string').join(': ')
  } catch { /* not JSON */ }
  return `http_${status}${msg ? `: ${msg}`.slice(0, 200) : ''}`
}

/**
 * POST https://api.resend.com/emails. fetchFn is injected (tests pass a fake).
 * Never throws. retryable: 429, 5xx, 408, 409 concurrent_idempotent_requests and
 * network errors/timeouts. Other 4xx (422 validation, 401/403 key or domain,
 * 409 invalid_idempotent_request) will not succeed on retry.
 * idempotencyKey = outbox id: Resend dedupes for 24h, so a retry after a
 * timeout cannot send the same mail twice.
 */
export async function sendEmail(fetchFn, { apiKey, from, to, subject, html, text, idempotencyKey, replyTo = SUPPORT_EMAIL } = {}) {
  if (!apiKey || !from || !to || !subject || !idempotencyKey) return { ok: false, error: 'invalid_input', retryable: false }
  let res
  let body = ''
  try {
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(SEND_TIMEOUT_MS) : undefined
    res = await fetchFn(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': String(idempotencyKey) },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, html, text }),
      ...(signal ? { signal } : {}),
    })
    body = await res.text()
  } catch (e) {
    return { ok: false, error: `network: ${String(e?.name ?? 'Error')}`, retryable: true }
  }
  if (res.status >= 200 && res.status < 300) {
    let id = null
    try { id = JSON.parse(body)?.id ?? null } catch { /* accepted anyway */ }
    return { ok: true, providerId: typeof id === 'string' ? id : undefined, retryable: false }
  }
  const retryable = res.status === 429 || res.status === 408 || res.status >= 500 || (res.status === 409 && body.includes('concurrent_idempotent_requests'))
  return { ok: false, error: shortError(body, res.status), retryable }
}

// ── queue runner ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Work through the queue once. Everything with side effects is injected:
 *   claim(limit)                      -> row[]  (huddle_ops.web_claim_outbox; attempts already +1)
 *   finish(id, ok, providerId, skip)  -> void   (huddle_ops.web_finish_outbox, same argument order)
 *   send({ to, subject, html, text, idempotencyKey }) -> { ok, providerId?, error?, retryable }
 *                                       (caller binds fetch / apiKey / from around sendEmail)
 *   render(kind, payload, { siteUrl }) -> { subject, html, text } | null   (default renderEmail)
 * A null render (kind not sent) -> finish skip. A render error or failed send
 * -> finish(ok=false): the DB re-queues it until the 5th attempt, then marks it
 * failed. One bad row never stops the others. Returns counts for THIS run:
 * { sent, failed (attempts that failed, incl. ones re-queued), skipped, errors[] }.
 * intervalMs spaces sends out (Resend's default limit is about 2 requests/second).
 */
export async function processOutbox({ claim, finish, send, render = renderEmail, siteUrl, max = 30, intervalMs = 600 } = {}) {
  const result = { sent: 0, failed: 0, skipped: 0, errors: [] }
  const rows = (await claim(max)) ?? []
  const note = (msg) => { if (result.errors.length < 5) result.errors.push(msg) }
  const settle = async (id, ok, providerId, skip) => {
    try { await finish(id, ok, providerId ?? null, skip) } catch (e) { note(`finish ${id}: ${String(e?.message ?? e).slice(0, 120)}`) }
  }
  let first = true
  for (const row of rows) {
    let mail
    try {
      mail = render(row.kind, row.payload, { siteUrl })
    } catch (e) {
      result.failed++
      note(`render ${row.id}: ${String(e?.message ?? e).slice(0, 120)}`)
      await settle(row.id, false, null, false)
      continue
    }
    if (!mail) {
      result.skipped++
      await settle(row.id, false, null, true)
      continue
    }
    if (!first && intervalMs > 0) await sleep(intervalMs)
    first = false
    let r
    try {
      r = await send({ to: row.to_email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: row.id })
    } catch (e) {
      r = { ok: false, error: `send threw: ${String(e?.message ?? e).slice(0, 80)}`, retryable: true }
    }
    if (r?.ok) {
      result.sent++
      await settle(row.id, true, r.providerId, false)
    } else {
      result.failed++
      note(`send ${row.id}: ${r?.error ?? 'unknown'}${r?.retryable ? ' (retryable)' : ''}`)
      await settle(row.id, false, null, false)
    }
  }
  return result
}
