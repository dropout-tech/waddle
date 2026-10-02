/**
 * Facts shown on the public legal / marketing pages (operator, contact, court).
 * Single source so every page and both languages stay identical.
 *
 * Deliberately NOT here (not provided yet, so never rendered anywhere):
 * postal address, service hours.
 * OPERATOR_NAME / SUPPORT_EMAIL were provided by the owner on 2026-10-02 and
 * are used by the website billing e-mails; legal pages do not render them yet.
 */
export const SUPPORT_PHONE = '0988-493-026'
export const SUPPORT_EMAIL = 'hi@lazy72.com'
export const OPERATOR_NAME = { zh: '廖思明', en: 'Liao Sih-Ming' } as const
export const SUPPORT_PHONE_TEL = 'tel:+886988493026'
export const LEGAL_UPDATED = { zh: '2026 年 10 月 3 日', en: 'October 3, 2026' } as const
export const COURT = { zh: '臺灣新北地方法院', en: 'the Taiwan New Taipei District Court' } as const
