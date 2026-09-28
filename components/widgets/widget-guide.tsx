'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, CalendarRange, CalendarClock, ListChecks, Star, PanelsTopLeft, NotebookPen, PencilLine, Timer, Droplets, LayoutGrid, CalendarCheck, Smartphone, type LucideIcon } from 'lucide-react'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { useI18n } from '@/lib/i18n/react'
import { isNative } from '@/lib/platform'

// Mirrors the Kind enum in ios/App/HuddleWidgets/HuddleWidgets.swift.
const WIDGETS: { name: string; body: string; Icon: LucideIcon }[] = [
  { name: '月曆＋今日任務', body: '這個月和今天要做的事，一眼看完', Icon: CalendarCheck },
  { name: '本週時間表', body: '未來七天哪些時段有安排，一目了然', Icon: CalendarRange },
  { name: '可視化小月曆', body: '有安排的日子會標上小點', Icon: CalendarDays },
  { name: '近期行程', body: '接下來七天有時間的安排', Icon: CalendarClock },
  { name: '任務清單', body: '在主畫面直接勾選完成', Icon: ListChecks },
  { name: '今天三件事', body: '只留下今天最重要的三件', Icon: Star },
  { name: '白板', body: '最近一張白板的縮圖，點一下接著寫', Icon: PanelsTopLeft },
  { name: '記事本', body: '最近的筆記，點一下打開', Icon: NotebookPen },
  { name: '專注記事', body: '專注時冒出的想法，先記下來', Icon: PencilLine },
  { name: '專注計時', body: '倒數計時就在主畫面', Icon: Timer },
  { name: '喝水提醒', body: '提醒你起來喝口水', Icon: Droplets },
  { name: '隨手記入口', body: '白板、記事本、專注記事一鍵直達', Icon: LayoutGrid },
]

const STEPS = [
  '長按主畫面空白處，直到圖示開始晃動',
  '點左上角的「＋」（或「編輯」→「加入小工具」），搜尋 Huddle',
  '選好大小後點「加入小工具」；之後長按小工具 →「編輯小工具」就能換成其他類型',
]

/**
 * /widgets — a short how-to for the native iPhone home-screen widgets. The
 * widgets themselves live on the home screen only (owner, 2026-09-28); this
 * page no longer simulates them.
 */
export function WidgetGuide() {
  const { t } = useI18n()
  // Capacitor is only known on the client; decide after mount to keep the
  // static-export HTML identical to the first client render.
  const [native, setNative] = useState<boolean | null>(null)
  useEffect(() => { setNative(isNative()) }, [])

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] text-foreground">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← {t('返回 Huddle')}</Link>
      </div>

      <header className="mt-4 flex items-center gap-4">
        <HuddleMascot className="h-16 w-16 shrink-0" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('把 Huddle 放上主畫面')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('不用打開 App，今天的行程、任務和想法就在手邊。')}</p>
        </div>
      </header>

      {native === false && (
        <div role="note" className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">{t('下載 iPhone App，就能把 Huddle 放在主畫面')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('小工具是 iPhone 主畫面的功能，網頁版無法加入。')}</p>
          </div>
        </div>
      )}

      <section className="mt-8" aria-labelledby="widget-steps">
        <h2 id="widget-steps" className="text-lg font-semibold">{native === false ? t('安裝 App 後，三個步驟加入') : t('三個步驟加入小工具')}</h2>
        <ol className="mt-3 space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">{i + 1}</span>
              <span className="pt-0.5 text-sm leading-relaxed">{t(step)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="widget-kinds">
        <h2 id="widget-kinds" className="text-lg font-semibold">{t('可以選的小工具')}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {WIDGETS.map(({ name, body, Icon }) => (
            <li key={name} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(name)}</span>
                <span className="block text-xs text-muted-foreground">{t(body)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        {t('點小工具會直接打開 Huddle 裡對應的畫面。內容由系統排程更新，打開 Huddle 就會立刻同步；鎖定畫面只顯示安全摘要。')}
        {native && <> {t('專注結束、喝水的背景通知可在「設定」中開啟。')}</>}
      </p>
    </main>
  )
}
