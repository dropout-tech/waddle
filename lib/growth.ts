import { parseDateString, toDateString } from '@/lib/calendar-utils'

export type GrowthDay = {
  id: string
  activityDate: string
  plannedCount: number
  completedCount: number
  focusMinutes: number
  reflectionCount: number
  footprintEarned: boolean
  createdAt: string
  updatedAt: string
}

export type GrowthAchievement = {
  key: string
  unlockedAt: string
  progress: number
}

export type GrowthJourney = {
  id: string
  title: string
  dailyStep: string
  durationDays: 7 | 14 | 30
  startDate: string
  status: 'active' | 'completed' | 'paused'
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export type GrowthJourneyDay = {
  id: string
  journeyId: string
  entryDate: string
  isComplete: boolean
  note?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export type AchievementDefinition = {
  key: string
  title: string
  description: string
  hint: string
  category: '探索' | '節奏' | '專注' | '回顧' | '旅程'
  tone: 'sage' | 'terracotta' | 'rose' | 'cream' | 'charcoal'
  shape: 'round' | 'drop' | 'flower' | 'arch' | 'soft-square'
  progress: (context: AchievementContext) => number
}

export type AchievementContext = {
  days: GrowthDay[]
  journeys: GrowthJourney[]
}

const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    key: 'first_footprint',
    title: '初芽',
    description: '留下第一天的 Huddle 腳印',
    hint: '完成一次安排、專注、任務或回顧',
    category: '探索',
    tone: 'sage',
    shape: 'round',
    progress: ({ days }) => clampProgress(days.some((day) => day.footprintEarned) ? 100 : 0),
  },
  {
    key: 'first_finish',
    title: '收好一件事',
    description: '完成第一件任務',
    hint: '完成一件任務',
    category: '探索',
    tone: 'terracotta',
    shape: 'drop',
    progress: ({ days }) => clampProgress(days.reduce((sum, day) => sum + day.completedCount, 0) * 100),
  },
  {
    key: 'gentle_rhythm',
    title: '有自己的步調',
    description: '最近七天留下三天腳印',
    hint: '一週內留下三天腳印',
    category: '節奏',
    tone: 'rose',
    shape: 'flower',
    progress: ({ days }) => {
      const recent = days.filter((day) => day.activityDate >= dateDaysAgo(6))
      return clampProgress((recent.filter((day) => day.footprintEarned).length / 3) * 100)
    },
  },
  {
    key: 'focus_companion',
    title: '專注時光',
    description: '累積兩小時的專注時間',
    hint: '完成幾段專注，累積 120 分鐘',
    category: '專注',
    tone: 'cream',
    shape: 'arch',
    progress: ({ days }) => clampProgress((days.reduce((sum, day) => sum + day.focusMinutes, 0) / 120) * 100),
  },
  {
    key: 'reflection_seed',
    title: '回頭看看',
    description: '在三個不同日子留下回顧',
    hint: '使用每日白板記下三天的想法',
    category: '回顧',
    tone: 'charcoal',
    shape: 'soft-square',
    progress: ({ days }) => clampProgress((days.filter((day) => day.reflectionCount > 0).length / 3) * 100),
  },
  {
    key: 'journey_begin',
    title: '帶著方向出發',
    description: '開始第一段成長旅程',
    hint: '建立一段 7、14 或 30 天旅程',
    category: '旅程',
    tone: 'terracotta',
    shape: 'drop',
    progress: ({ journeys }) => clampProgress(journeys.length > 0 ? 100 : 0),
  },
  {
    key: 'journey_complete',
    title: '旅途留在手帳裡',
    description: '完成第一段成長旅程',
    hint: '走完一段旅程',
    category: '旅程',
    tone: 'sage',
    shape: 'round',
    progress: ({ journeys }) => clampProgress(journeys.some((journey) => journey.status === 'completed') ? 100 : 0),
  },
]

export function dateDaysAgo(days: number, from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() - days)
  return toDateString(date)
}

export function daysBetweenLocal(start: string, end: string): number {
  const a = parseDateString(start)
  const b = parseDateString(end)
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bUtc - aUtc) / 86_400_000)
}

export function getRecentDateKeys(count: number, end = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => dateDaysAgo(count - index - 1, end))
}

export function getJourneyDayNumber(journey: GrowthJourney, today = toDateString(new Date())): number {
  return Math.max(1, Math.min(journey.durationDays, daysBetweenLocal(journey.startDate, today) + 1))
}

export function getAchievementProgress(
  definition: AchievementDefinition,
  context: AchievementContext
): number {
  return definition.progress(context)
}
