'use client'

import Image from 'next/image'
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Check,
  ChevronDown,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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

const GROWTH_SECTIONS_STORAGE_KEY = 'huddle.growth.sections.v1'
const GROWTH_SECTIONS_CHANGE_EVENT = 'huddle:growth-sections-change'

type GrowthSectionKey = 'footprints' | 'room' | 'achievements'
type GrowthSectionState = Record<GrowthSectionKey, boolean>

const DEFAULT_GROWTH_SECTIONS: GrowthSectionState = {
  footprints: true,
  room: false,
  achievements: false,
}
const DEFAULT_GROWTH_SECTIONS_SNAPSHOT = JSON.stringify(DEFAULT_GROWTH_SECTIONS)
let volatileGrowthSectionsSnapshot = DEFAULT_GROWTH_SECTIONS_SNAPSHOT

function readGrowthSectionsSnapshot() {
  try {
    const saved = window.localStorage.getItem(GROWTH_SECTIONS_STORAGE_KEY)
    if (saved) volatileGrowthSectionsSnapshot = saved
  } catch {
    // Fall through to the in-memory snapshot when storage is unavailable.
  }
  return volatileGrowthSectionsSnapshot
}

function subscribeToGrowthSections(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === GROWTH_SECTIONS_STORAGE_KEY) onStoreChange()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(GROWTH_SECTIONS_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(GROWTH_SECTIONS_CHANGE_EVENT, onStoreChange)
  }
}

function parseGrowthSections(snapshot: string): GrowthSectionState {
  try {
    const parsed = JSON.parse(snapshot) as Partial<GrowthSectionState>
    return {
      footprints: typeof parsed.footprints === 'boolean' ? parsed.footprints : DEFAULT_GROWTH_SECTIONS.footprints,
      room: typeof parsed.room === 'boolean' ? parsed.room : DEFAULT_GROWTH_SECTIONS.room,
      achievements: typeof parsed.achievements === 'boolean' ? parsed.achievements : DEFAULT_GROWTH_SECTIONS.achievements,
    }
  } catch {
    return DEFAULT_GROWTH_SECTIONS
  }
}

function writeGrowthSections(next: GrowthSectionState) {
  volatileGrowthSectionsSnapshot = JSON.stringify(next)
  try {
    window.localStorage.setItem(GROWTH_SECTIONS_STORAGE_KEY, volatileGrowthSectionsSnapshot)
  } catch {
    // The current interaction still completes even when storage is unavailable.
  }
  window.dispatchEvent(new Event(GROWTH_SECTIONS_CHANGE_EVENT))
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
  const openSectionsSnapshot = useSyncExternalStore(
    subscribeToGrowthSections,
    readGrowthSectionsSnapshot,
    () => DEFAULT_GROWTH_SECTIONS_SNAPSHOT
  )
  const openSections = useMemo(() => parseGrowthSections(openSectionsSnapshot), [openSectionsSnapshot])
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

  function setSectionOpen(section: GrowthSectionKey, open: boolean) {
    writeGrowthSections({ ...openSections, [section]: open })
  }

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
        <Collapsible
          asChild
          open={openSections.footprints}
          onOpenChange={(open) => setSectionOpen('footprints', open)}
        >
          <section aria-labelledby="footprints-heading" className="min-w-0 self-start">
            <CollapsibleSectionHeader
              headingId="footprints-heading"
              title={t('今日腳印')}
              description={t('做過一件有意義的事，今天就會留下兩枚圓圓腳印。')}
              meta={t('最近 28 天')}
              open={openSections.footprints}
            />
            <CollapsibleContent>
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
            </CollapsibleContent>
          </section>
        </Collapsible>

        <HuddleRoom
          unlockedCount={unlockedKeys.size}
          open={openSections.room}
          onOpenChange={(open) => setSectionOpen('room', open)}
        />

        <JourneyNotebook
          activeJourney={activeJourney}
          completedDays={completedJourneyDays}
          todayComplete={Boolean(todayJourneyEntry?.isComplete)}
          isSaving={growth.isSaving}
          onCreate={() => setCreateOpen(true)}
          onToggle={handleToggleJourney}
          onComplete={handleCompleteJourney}
        />

        <Collapsible
          asChild
          open={openSections.achievements}
          onOpenChange={(open) => setSectionOpen('achievements', open)}
        >
          <section aria-labelledby="achievements-heading" className="min-w-0 self-start">
            <CollapsibleSectionHeader
              headingId="achievements-heading"
              title={t('成就收藏')}
              description={t('不是比快，只是把走過的路收好。')}
              meta={`${unlockedKeys.size}/${ACHIEVEMENT_DEFINITIONS.length}`}
              open={openSections.achievements}
            />
            <CollapsibleContent>
              <AchievementShelf
                items={ACHIEVEMENT_DEFINITIONS.map((definition) => ({
                  definition,
                  unlocked: unlockedKeys.has(definition.key),
                  progress: getAchievementProgress(definition, achievementContext),
                }))}
              />
            </CollapsibleContent>
          </section>
        </Collapsible>
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

function CollapsibleSectionHeader({
  headingId,
  title,
  description,
  meta,
  open,
}: {
  headingId: string
  title: ReactNode
  description: ReactNode
  meta?: ReactNode
  open: boolean
}) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className={cn(
          'group mb-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left transition-colors duration-200 ease-quart',
          'hover:bg-secondary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !open && 'border-b border-border/70'
        )}
      >
        <span className="min-w-0">
          <span id={headingId} className="block text-lg font-semibold text-foreground">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted-foreground">
          {meta}
          <ChevronDown
            className={cn('h-5 w-5 transition-transform duration-200 ease-quart', !open && '-rotate-90')}
            aria-hidden="true"
          />
        </span>
      </button>
    </CollapsibleTrigger>
  )
}

function HuddleRoom({
  unlockedCount,
  open,
  onOpenChange,
}: {
  unlockedCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <Collapsible asChild open={open} onOpenChange={onOpenChange}>
      <section aria-labelledby="room-heading" className="min-w-0 self-start">
        <CollapsibleSectionHeader
          headingId="room-heading"
          title={t('Huddle 的房間')}
          description={t('收藏增加時，房間也會慢慢住進新的東西。')}
          open={open}
        />
        <CollapsibleContent>
          <div className="relative aspect-[1400/788] overflow-hidden rounded-[1.5rem] border border-border/75 bg-[oklch(0.965_0.012_85)] shadow-sm">
            <Image
              src="/growth/huddle-room.jpg"
              alt={t('Huddle 坐在陶土質感的房間裡，周圍有植物、書架與背包。')}
              fill
              priority
              sizes="(min-width: 1024px) 540px, 100vw"
              className="object-cover"
            />

            {unlockedCount < 1 && (
              <RoomObjectVeil
                className="bottom-[22%] left-[15%]"
                label={t('獲得第一枚成就後，植物會住進房間。')}
              />
            )}
            {unlockedCount < 3 && (
              <RoomObjectVeil
                className="bottom-[25%] right-[31%]"
                label={t('獲得三枚成就後，收藏與書櫃會住進房間。')}
              />
            )}
            {unlockedCount < 5 && (
              <RoomObjectVeil
                className="bottom-[19%] right-[8.5%]"
                label={t('獲得五枚成就後，背包會住進房間。')}
              />
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

function RoomObjectVeil({
  className,
  label,
}: {
  className: string
  label: string
}) {
  return (
    <div
      className={cn(
        'absolute flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-[oklch(0.965_0.012_85)]/88 shadow-sm backdrop-blur-[3px]',
        className
      )}
      aria-label={label}
      role="img"
    >
      <LockKeyhole className="h-4 w-4 text-[oklch(0.43_0.025_55)]/75" aria-hidden="true" />
    </div>
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

interface AchievementShelfItem {
  definition: AchievementDefinition
  unlocked: boolean
  progress: number
}

function AchievementShelf({ items }: { items: AchievementShelfItem[] }) {
  const { t } = useI18n()

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-3 pt-2">
      <div className="relative min-w-[700px] pb-1">
        <div className="relative h-[196px]" aria-hidden="true">
          <ol className="pointer-events-none absolute inset-x-0 top-0 grid h-[125px] grid-cols-7">
            {items.map(({ definition, unlocked }, index) => (
              <li key={definition.key} className="relative">
                <span
                  className={cn(
                    'absolute inset-0 bg-[url("/growth/achievement-medallions.png")] bg-[length:700%_100%] bg-no-repeat transition-[filter,opacity] duration-200 ease-quart',
                    !unlocked && 'opacity-55 grayscale-[.72] saturate-50'
                  )}
                  style={{ backgroundPosition: `${(index / Math.max(items.length - 1, 1)) * 100}% 0` }}
                />
              </li>
            ))}
          </ol>
          <Image
            src="/growth/achievement-shelf.png"
            alt=""
            width={1400}
            height={194}
            sizes="700px"
            className="pointer-events-none absolute inset-x-0 top-[98px] h-[97px] w-full object-contain object-top"
          />
        </div>

        <ol className="absolute inset-x-0 top-0 grid h-[132px] grid-cols-7 px-[1.5%]">
          {items.map(({ definition, unlocked, progress }) => (
            <li
              key={definition.key}
              className="relative flex justify-center"
              aria-label={
                unlocked
                  ? `${t(definition.title)}：${t(definition.description)}`
                  : `${t(definition.title)}：${t(definition.hint)}，${Math.round(progress)}%`
              }
              title={unlocked ? t(definition.description) : t(definition.hint)}
            >
              {!unlocked && (
                <span className="absolute right-[10%] top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-[oklch(0.94_0.012_85)]/92 text-[oklch(0.39_0.025_55)] shadow-sm backdrop-blur-sm">
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
            </li>
          ))}
        </ol>

        <ol className="grid grid-cols-7 gap-2 px-[1.5%] text-center">
          {items.map(({ definition, unlocked, progress }) => (
            <li key={definition.key} className="min-w-0">
              <p className="text-xs font-semibold leading-4 text-foreground">
                {t(definition.title)}
              </p>
              {unlocked ? (
                <p className="mt-1 text-[0.68rem] leading-4 text-[oklch(0.43_0.035_145)]">
                  {t('已收藏')}
                </p>
              ) : (
                <div className="mx-auto mt-1.5 max-w-[4.5rem]">
                  <div className="h-1 overflow-hidden rounded-full bg-[oklch(0.86_0.012_75)]">
                    <span
                      className="block h-full rounded-full bg-[oklch(0.58_0.06_55)] transition-[width] duration-200 ease-quart"
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.65rem] tabular-nums leading-4 text-muted-foreground">
                    {Math.round(progress)}%
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
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
