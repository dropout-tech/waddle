import type { AiConsentFeature } from '@/lib/ai-consent'
import type { OperatorInfo } from '@/lib/ai-review/operator'

type T = (text: string, vars?: Record<string, string | number>) => string

export type ConsentBlock =
  | { kind: 'text'; heading: string; paragraphs?: string[]; bullets?: string[] }
  /** Where the "include meeting highlights" switch goes (AI review only). */
  | { kind: 'meeting-highlights' }

export interface ConsentCopy {
  title: string
  intro: string
  blocks: ConsentBlock[]
  ageLine: string
}

/**
 * Consent screen wording. Chinese is the owner-approved text from
 * docs/legal/2026-10-01-ai-consent-copy-draft.md (sections A and B, decision #10
 * of spec v5); English follows the same structure. It covers the nine required
 * elements of spec 6.2: operator + contact, purpose, what is / is not sent,
 * recipient + region + when sent, retention, rights, effect of declining,
 * withdrawal limits + reminder, and the two equal buttons + privacy link
 * (rendered by AiConsentDialog).
 *
 * Wording changes that do not change the scope only bump `copyVersion` in
 * lib/ai-consent.ts.
 */
export function buildConsentCopy(feature: AiConsentFeature, t: T, operator: OperatorInfo): ConsentCopy {
  const who = {
    kind: 'text' as const,
    heading: t('誰在處理'),
    paragraphs: [t('Huddle 由 {name} 營運。聯絡方式：{email}。', { name: operator.name, email: operator.email })],
  }
  const contact = t('其他個人資料的請求，請聯絡 {email}。', { email: operator.email })
  const ageLine = t('我已滿 18 歲，或已取得法定代理人同意。')

  if (feature === 'meeting_import') {
    return {
      title: t('使用 AI 會議整理之前'),
      intro: t('AI 會議整理會把你貼上的內容送給第三方 AI 服務來整理重點。請先看完下面的說明。'),
      blocks: [
        who,
        { kind: 'text', heading: t('用途'), paragraphs: [t('只用來整理這場會議的重點、決議與建議任務。')] },
        {
          kind: 'text',
          heading: t('會送出的內容'),
          paragraphs: [t('你貼上的會議逐字稿或筆記、會議標題與日期、你填寫的與會者姓名與所屬組織。')],
        },
        {
          kind: 'text',
          heading: t('送給誰、送到哪裡'),
          paragraphs: [t('OpenAI（第三方 AI 服務），在美國處理。只有在你按下「整理」時才會傳送。')],
        },
        {
          kind: 'text',
          heading: t('保留多久'),
          paragraphs: [
            t('OpenAI 預設不會用這些內容訓練模型。為了偵測濫用，OpenAI 可能保留最長 30 天的紀錄；法律要求時可能更久。'),
            t('你貼上的內容與整理結果會存在 Huddle。你可以隨時在每筆會議紀錄刪除逐字稿原文；整理結果會保留到你刪除帳號。'),
          ],
        },
        {
          kind: 'text',
          heading: t('你可以做的事'),
          paragraphs: [t('你可以隨時在「設定」撤回同意。撤回之後不會再傳送新的內容；已經送出的內容無法收回。'), contact],
        },
        {
          kind: 'text',
          heading: t('不同意會怎樣'),
          paragraphs: [t('只是不能使用 AI 會議整理。Huddle 的其他功能照常使用。')],
        },
        {
          kind: 'text',
          heading: t('提醒'),
          paragraphs: [
            t('AI 產生的內容可能有誤。逐字稿通常包含其他與會者的姓名與發言，請確認你可以這樣使用，並避免貼上他人未同意分享的機密或敏感內容。'),
          ],
        },
      ],
      ageLine,
    }
  }

  return {
    title: t('開啟 AI 回顧之前'),
    intro: t('AI 回顧會把你的部分內容送給第三方 AI 服務來寫報告。請先看完下面的說明，再決定要不要使用。'),
    blocks: [
      who,
      { kind: 'text', heading: t('用途'), paragraphs: [t('只用來產生一份給你自己看的回顧報告，不做其他用途。')] },
      {
        kind: 'text',
        heading: t('會送出的內容'),
        paragraphs: [t('你在所選期間內自己建立的：')],
        bullets: [
          t('任務的標題、說明、備註、分類、日期與完成狀態'),
          t('便條紙的文字'),
          t('專注白板的文字與待辦'),
          t('行事曆時間區塊與專注紀錄'),
        ],
      },
      {
        kind: 'text',
        heading: t('不會送出的內容'),
        paragraphs: [
          t('圖片與手寫、記事本、Google 日曆事件、別人指派給你的任務、會議連結、地點、與會者名單、會議逐字稿。'),
          t('你接受別人的會議指派而產生的任務，只會送出標題、完成狀態、完成時間、截止日與排程時間。'),
        ],
      },
      { kind: 'meeting-highlights' },
      {
        kind: 'text',
        heading: t('送給誰、送到哪裡'),
        paragraphs: [t('OpenAI（第三方 AI 服務），在美國處理。只有在你按下「產生報告」時才會傳送。')],
      },
      {
        kind: 'text',
        heading: t('保留多久'),
        paragraphs: [
          t('OpenAI 預設不會用這些內容訓練模型。為了偵測濫用，OpenAI 可能保留最長 30 天的紀錄；法律要求時可能更久。'),
          t('產生的報告存在 Huddle，直到你刪除報告或刪除帳號。'),
        ],
      },
      {
        kind: 'text',
        heading: t('你可以做的事'),
        paragraphs: [
          t('你可以隨時在「設定」撤回同意，也可以刪除任何一份報告。撤回之後不會再傳送新的內容；已經送出的內容無法收回。'),
          contact,
        ],
      },
      {
        kind: 'text',
        heading: t('不同意會怎樣'),
        paragraphs: [t('只是不能使用 AI 回顧。Huddle 的其他功能照常使用。')],
      },
      {
        kind: 'text',
        heading: t('提醒'),
        paragraphs: [
          t('AI 產生的內容可能有誤。你的內容如果含有他人資訊或敏感資訊（例如健康、財務），請自行斟酌是否使用。'),
        ],
      },
    ],
    ageLine,
  }
}
