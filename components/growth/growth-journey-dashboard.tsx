'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Backpack,
  BookOpen,
  Check,
  CircleCheck,
  Flag,
  Leaf,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { ModalShell } from '@/components/modals/modal-shell'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { HuddleFootprints } from './huddle-footprints'
import { useHuddleGrowth } from '@/hooks/use-huddle-growth'
import {
  ACHIEVEMENT_DEFINITIONS,
  getAchievementProgress,
  getJourneyDayNumber,
  getRecentDateKeys,
  type AchievementDefinition,
  type GrowthJourney,
} from '@/lib/growth'
import { parseDateString, toDateString } from '@/lib/calendar-utils'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import type { ScratchpadItem, Workspace } from '@/lib/types'

interface GrowthJourneyDashboardProps {
  workspaces: Workspace[]
  scratchpadByDate: Record<string, ScratchpadItem[]>
}

const MEDALLION_TONES: Record<AchievementDefinition['tone'], string> = {
  sage: 'bg-[oklch(0.79_0.055_145)] text-[oklch(0.28_0.035_145)] border-[oklch(0.62_0.06_145)]',
  terracotta: 'bg-[oklch(0.76_0.09_35)] text-[oklch(0.3_0.055_35)] border-[oklch(0.58_0.11_35)]',
  rose: 'bg-[oklch(0.84_0.055_15)] text-[oklch(0.31_0.045_15)] border-[oklch(0.66_0.07_15)]',
  cream: 'bg-[oklch(0.91_0.025_85)] text-[oklch(0.3_0.025_55)] border-[oklch(0.75_0.035_85)]',
  charcoal: 'bg-[oklch(0.48_0.02_55)] text-[oklch(0.95_0.008_85)] border-[oklch(0.34_0.025_55)]',
}

const MEDALLION_SHAPES: Record<AchievementDefinition['shape'], string> = {
  round: 'rounded-full',
  drop: 'rounded-[52%_52%_48%_48%/65%_65%_35%_35%]',
  flower: 'rounded-[44%_56%_48%_52%/52%_44%_56%_48%]',
  arch: 'rounded-t-[50%] rounded-b-[28%]',
  'soft-square': 'rounded-2xl rotate-2',
}

function dayLabel(dateKey: string, lang: string) {
  const date = parseDateString(dateKey)
  if (lang === 'en') return `${date.getMonth() + 1}/${date.getDate()}`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function GrowthJourneyDashboard({ workspaces, scratchpadByDate }: GrowthJourneyDashboardProps) {
  const { t, lang } = useI18n()
  const growth = useHuddleGrowth({ workspaces, scratchpadByDate })
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dailyStep, setDailyStep] = useState('')
  const [durationDays, setDurationDays] = useState<7 | 14 | 30>(14)
  const today = toDateString(new Date())
  const recentDates = useMemo(() => getRecentDateKeys(28), [])
  const daysByDate = useMemo(
    () => new Map(growth.days.map((day) => [day.activityDate, day])),
    [growth.days]
  )
  const unlockedKeys = useMemo(
    () => new Set(growth.achievements.map((achievement) => achievement.key)),
    [growth.achievements]
  )
  const achievementContext = useMemo(
    () => ({ days: growth.days, journeys: growth.journeys }),
    [growth.days, growth.journeys]
  )

  const activeJourney = growth.activeJourney
  const journeyEntries = activeJourney
    ? growth.journeyDays.filter((entry) => entry.journeyId === activeJourney.id)
    : []
  const completedJourneyDays = journeyEntries.filter((entry) => entry.isComplete).length
  const todayJourneyEntry = journeyEntries.find((entry) => entry.entryDate === today)

  async function handleCreateJourney(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !dailyStep.trim()) return
    try {
      await growth.createJourney({ title, dailyStep, durationDays })
      setCreateOpen(false)
      setTitle('')
      setDailyStep('')
      setDurationDays(14)
      toast.success(t('旅程已經放進手帳裡了。'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('旅程沒有存好，請再試一次。'))
    }
  }

  async function handleToggleJourney(journey: GrowthJourney) {
    try {
      const result = await growth.toggleTodayJourneyStep(journey)
      toast.success(result.isComplete ? t('今天這一步，已經走過了。') : t('今天先留白也沒關係。'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('今天的旅程沒有存好，請再試一次。'))
    }
  }

  async function handleCompleteJourney(journey: GrowthJourney) {
    try {
      await growth.completeJourney(journey)
      toast.success(t('這段旅程收進收藏了。'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('旅程沒有完成，請再試一次。'))
    }
  }

  if (growth.isLoading) return <GrowthLoading />

  if (growth.error && growth.days.length === 0 && growth.journeys.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <HuddleMascot className="h-24 w-24 [transform:scaleY(.97)]" phase="auto" />
        <h2 className="mt-5 text-xl font-semibold text-balance">{t('成長旅程還沒打開')}</h2>
        <p className="mt-2 max-w-[46ch] text-sm leading-6 text-muted-foreground">{t(growth.error)}</p>
        <button
          type="button"
          onClick={() => void growth.reload()}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('重新讀取成長旅程')}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] pb-12">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Leaf className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{t('成長旅程')}</h1>
          </div>
          <p className="mt-2 max-w-[58ch] text-sm leading-6 text-muted-foreground">
            {t('留下每天走過的痕跡，慢慢看見自己的節奏。')}
          </p>
        </div>
        {!activeJourney && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('開始一段旅程')}
          </button>
        )}
      </div>

      {growth.error && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm" role="status">
          <p className="leading-6">{t(growth.error)}</p>
          <button type="button" onClick={growth.clearError} className="shrink-0 underline underline-offset-4">
            {t('知道了')}
          </button>
        </div>
      )}

      <div className="grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section aria-labelledby="footprints-heading" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="footprints-heading" className="text-lg font-semibold">{t('今日腳印')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('做過一件有意義的事，今天就會留下兩枚圓圓腳印。')}</p>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {t('最近 28 天')}
            </span>
          </div>
          <div className="rounded-[1.25rem] border border-border/80 bg-card px-3 py-5 shadow-sm sm:px-5">
            <ol className="grid grid-cols-7 gap-x-2 gap-y-5" aria-label={t('最近 28 天的腳印')}>
              {recentDates.map((dateKey) => {
                const day = daysByDate.get(dateKey)
                const earned = Boolean(day?.footprintEarned)
                return (
                  <li key={dateKey} className="flex min-w-0 flex-col items-center gap-2">
                    <time
                      dateTime={dateKey}
                      className={cn(
                        'text-[0.7rem] tabular-nums text-muted-foreground',
                        dateKey === today && 'font-semibold text-primary'
                      )}
                    >
                      {dayLabel(dateKey, lang)}
                    </time>
                    <HuddleFootprints
                      earned={earned}
                      current={dateKey === today}
                      className="h-8 w-10"
                    />
                    <span className="sr-only">
                      {earned ? t('這天留下了 Huddle 腳印') : t('這天還沒有腳印')}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        <HuddleRoom unlockedCount={unlockedKeys.size} />

        <JourneyNotebook
          activeJourney={activeJourney}
          completedDays={completedJourneyDays}
          todayComplete={Boolean(todayJourneyEntry?.isComplete)}
          isSaving={growth.isSaving}
          onCreate={() => setCreateOpen(true)}
          onToggle={handleToggleJourney}
          onComplete={handleCompleteJourney}
        />

        <section aria-labelledby="achievements-heading" className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="achievements-heading" className="text-lg font-semibold">{t('成就收藏')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('不是比快，只是把走過的路收好。')}</p>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">
              {unlockedKeys.size}/{ACHIEVEMENT_DEFINITIONS.length}
            </span>
          </div>
          <div className="overflow-x-auto pb-3">
            <div className="flex min-w-max items-end gap-3 px-1 pt-4">
              {ACHIEVEMENT_DEFINITIONS.map((definition) => {
                const unlocked = unlockedKeys.has(definition.key)
                const progress = getAchievementProgress(definition, achievementContext)
                return (
                  <AchievementMedallion
                    key={definition.key}
                    definition={definition}
                    unlocked={unlocked}
                    progress={progress}
                  />
                )
              })}
            </div>
            <div className="h-4 min-w-max rounded-b-xl border-x border-b border-[oklch(0.55_0.055_55)] bg-[oklch(0.68_0.065_55)] shadow-sm" aria-hidden="true" />
          </div>
        </section>
      </div>

      <JourneyCreateModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={title}
        dailyStep={dailyStep}
        durationDays={durationDays}
        isSaving={growth.isSaving}
        onTitleChange={setTitle}
        onDailyStepChange={setDailyStep}
        onDurationChange={setDurationDays}
        onSubmit={handleCreateJourney}
      />
    </div>
  )
}

function HuddleRoom({ unlockedCount }: { unlockedCount: number }) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="room-heading" className="min-w-0">
      <div className="mb-3">
        <h2 id="room-heading" className="text-lg font-semibold">{t('Huddle 的房間')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('收藏增加時，房間也會慢慢住進新的東西。')}</p>
      </div>
      <div className="relative min-h-[260px] overflow-hidden rounded-[44%_44%_1.4rem_1.4rem/22%_22%_1.4rem_1.4rem] border border-border bg-[oklch(0.96_0.012_85)] shadow-inner dark:bg-[oklch(0.235_0.016_55)]">
        <div className="absolute left-[8%] top-[22%] flex h-20 w-16 items-center justify-center rounded-t-[50%] border-4 border-[oklch(0.62_0.05_55)] bg-background/75" aria-hidden="true">
          <span className="h-full w-px bg-[oklch(0.62_0.05_55)]" />
        </div>
        {unlockedCount >= 1 && (
          <div className="absolute bottom-7 left-[10%] flex flex-col items-center text-[oklch(0.45_0.08_145)]" aria-hidden="true">
            <Leaf className="h-12 w-12" />
            <span className="h-8 w-10 rounded-b-xl rounded-t-md bg-[oklch(0.67_0.09_35)]" />
          </div>
        )}
        {unlockedCount >= 3 && (
          <div className="absolute bottom-7 right-[10%] flex items-end gap-1 rounded-lg bg-[oklch(0.67_0.04_145)] px-3 py-2 text-[oklch(0.28_0.025_55)]" aria-hidden="true">
            <BookOpen className="h-8 w-8" />
            <span className="h-10 w-2 rounded-sm bg-primary/70" />
            <span className="h-8 w-2 rounded-sm bg-accent" />
          </div>
        )}
        {unlockedCount >= 5 && (
          <Backpack className="absolute bottom-8 right-[29%] h-11 w-11 text-[oklch(0.57_0.105_35)]" aria-hidden="true" />
        )}
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <div className="flex h-11 w-40 items-end justify-center rounded-[50%] bg-[oklch(0.78_0.04_145)]/70">
            <HuddleMascot
              className="mb-1 h-32 w-32 origin-bottom [transform:scaleY(.97)]"
              phase="auto"
              decorative={false}
            />
          </div>
        </div>
        {unlockedCount === 0 && (
          <p className="absolute right-4 top-4 max-w-40 text-right text-xs leading-5 text-muted-foreground">
            {t('第一枚成就會帶來房間的第一盆植物。')}
          </p>
        )}
      </div>
    </section>
  )
}

function JourneyNotebook({
  activeJourney,
  completedDays,
  todayComplete,
  isSaving,
  onCreate,
  onToggle,
  onComplete,
}: {
  activeJourney: GrowthJourney | null
  completedDays: number
  todayComplete: boolean
  isSaving: boolean
  onCreate: () => void
  onToggle: (journey: GrowthJourney) => void
  onComplete: (journey: GrowthJourney) => void
}) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="journey-heading" className="min-w-0">
      <div className="mb-3">
        <h2 id="journey-heading" className="text-lg font-semibold">{t('我的旅程')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('每天只留一小步，方向比速度重要。')}</p>
      </div>
      <div className="notebook-lines min-h-[278px] rounded-[1.35rem] border border-border bg-card px-5 py-5 shadow-sm sm:px-7">
        {activeJourney ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-primary">
                  {t('第 {day} 天', { day: getJourneyDayNumber(activeJourney) })}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-balance">{activeJourney.title}</h3>
                <p className="mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">{activeJourney.dailyStep}</p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {t('{n} 天旅程', { n: activeJourney.durationDays })}
              </span>
            </div>

            <div className="mt-7 flex items-center gap-1.5" aria-label={t('旅程完成進度')}>
              {Array.from({ length: activeJourney.durationDays }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-2 flex-1 rounded-full border border-border',
                    index < completedDays ? 'bg-primary border-primary' : 'bg-background'
                  )}
                />
              ))}
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {t('已留下 {done}／{total} 天', { done: completedDays, total: activeJourney.durationDays })}
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-3 pt-7">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onToggle(activeJourney)}
                aria-pressed={todayComplete}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60',
                  todayComplete
                    ? 'border border-primary/35 bg-primary/10 text-foreground hover:bg-primary/15'
                    : 'bg-primary text-primary-foreground hover:brightness-95'
                )}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : todayComplete ? <CircleCheck className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {todayComplete ? t('今天已經走過了') : t('記下今天這一步')}
              </button>
              {completedDays >= activeJourney.durationDays && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onComplete(activeJourney)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <Flag className="h-4 w-4" />
                  {t('收好這段旅程')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[238px] flex-col items-center justify-center text-center">
            <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold">{t('想慢慢走向哪裡？')}</h3>
            <p className="mt-2 max-w-[40ch] text-sm leading-6 text-muted-foreground">
              {t('替一件重要的事留 7、14 或 30 天，每天只做一個小步驟。')}
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" />
              {t('開始一段旅程')}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function AchievementMedallion({
  definition,
  unlocked,
  progress,
}: {
  definition: AchievementDefinition
  unlocked: boolean
  progress: number
}) {
  const { t } = useI18n()
  return (
    <div className="flex w-24 flex-col items-center gap-2 text-center">
      <div
        className={cn(
          'relative flex h-[4.6rem] w-[4.6rem] items-center justify-center border-2 shadow-sm transition-[filter,opacity] duration-200 ease-quart',
          MEDALLION_SHAPES[definition.shape],
          unlocked ? MEDALLION_TONES[definition.tone] : 'border-border bg-muted text-muted-foreground opacity-60 grayscale'
        )}
        title={unlocked ? t(definition.description) : t(definition.hint)}
      >
        {unlocked ? (
          definition.key.includes('journey') ? <Flag className="h-7 w-7" />
            : definition.key.includes('focus') ? <Sparkles className="h-7 w-7" />
              : <Leaf className="h-7 w-7" />
        ) : (
          <LockKeyhole className="h-6 w-6" />
        )}
      </div>
      <div>
        <p className="text-xs font-semibold leading-4">{unlocked ? t(definition.title) : t('還沒揭曉')}</p>
        {!unlocked && (
          <p className="mt-0.5 text-[0.68rem] tabular-nums text-muted-foreground">{progress}%</p>
        )}
      </div>
    </div>
  )
}

function JourneyCreateModal({
  isOpen,
  onClose,
  title,
  dailyStep,
  durationDays,
  isSaving,
  onTitleChange,
  onDailyStepChange,
  onDurationChange,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  dailyStep: string
  durationDays: 7 | 14 | 30
  isSaving: boolean
  onTitleChange: (value: string) => void
  onDailyStepChange: (value: string) => void
  onDurationChange: (value: 7 | 14 | 30) => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const { t } = useI18n()
  return (
    <ModalShell isOpen={isOpen} onClose={onClose} size="md" ariaLabel={t('開始一段旅程')}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">{t('開始一段旅程')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('不用排滿，每天留下一個做得到的小步驟就好。')}</p>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-6">
          <label className="block">
            <span className="text-sm font-medium">{t('旅程名稱')}</span>
            <input
              required
              maxLength={80}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={t('例如：把作品集慢慢整理好')}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t('每天的一小步')}</span>
            <input
              required
              maxLength={120}
              value={dailyStep}
              onChange={(event) => onDailyStepChange(event.target.value)}
              placeholder={t('例如：整理一個作品並寫下說明')}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">{t('想留多少天')}</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onDurationChange(days)}
                  aria-pressed={durationDays === days}
                  className={cn(
                    'min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    durationDays === days
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-secondary'
                  )}
                >
                  {t('{n} 天', { n: days })}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-sm font-medium hover:bg-secondary">
            {t('先不開始')}
          </button>
          <button
            type="submit"
            disabled={isSaving || !title.trim() || !dailyStep.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('放進我的旅程')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function GrowthLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] animate-pulse pb-12" aria-label="Loading growth journey">
      <div className="mb-8 h-8 w-44 rounded-lg bg-muted" />
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="h-72 rounded-2xl bg-muted" />
        <div className="h-72 rounded-[2rem] bg-muted" />
        <div className="h-72 rounded-2xl bg-muted" />
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
