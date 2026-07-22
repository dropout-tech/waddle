'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import { toDateString } from '@/lib/calendar-utils'
import {
  ACHIEVEMENT_DEFINITIONS,
  dateDaysAgo,
  getAchievementProgress,
  type GrowthAchievement,
  type GrowthDay,
  type GrowthJourney,
  type GrowthJourneyDay,
} from '@/lib/growth'
import {
  HUDDLE_POMODORO_COUNT_EVENT,
  loadPomodoroCount,
  type PomodoroDayCount,
} from '@/lib/pomodoro-count'
import type { ScratchpadItem, Workspace } from '@/lib/types'

type GrowthDayRow = Database['public']['Tables']['growth_days']['Row']
type GrowthAchievementRow = Database['public']['Tables']['growth_achievements']['Row']
type GrowthJourneyRow = Database['public']['Tables']['growth_journeys']['Row']
type GrowthJourneyDayRow = Database['public']['Tables']['growth_journey_days']['Row']

type CreateJourneyInput = {
  title: string
  dailyStep: string
  durationDays: 7 | 14 | 30
}

type UseHuddleGrowthArgs = {
  workspaces: Workspace[]
  scratchpadByDate: Record<string, ScratchpadItem[]>
}

const mapDay = (row: GrowthDayRow): GrowthDay => ({
  id: row.id,
  activityDate: row.activity_date,
  plannedCount: row.planned_count,
  completedCount: row.completed_count,
  focusMinutes: row.focus_minutes,
  reflectionCount: row.reflection_count,
  footprintEarned: row.footprint_earned,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapAchievement = (row: GrowthAchievementRow): GrowthAchievement => ({
  key: row.achievement_key,
  unlockedAt: row.unlocked_at,
  progress: row.progress,
})

const mapJourney = (row: GrowthJourneyRow): GrowthJourney => ({
  id: row.id,
  title: row.title,
  dailyStep: row.daily_step,
  durationDays: row.duration_days,
  startDate: row.start_date,
  status: row.status,
  completedAt: row.completed_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapJourneyDay = (row: GrowthJourneyDayRow): GrowthJourneyDay => ({
  id: row.id,
  journeyId: row.journey_id,
  entryDate: row.entry_date,
  isComplete: row.is_complete,
  note: row.note ?? undefined,
  completedAt: row.completed_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '無法讀取成長旅程，請稍後再試。'
  const value = error as { code?: string; message?: string }
  if (value.code === '42P01' || value.code === 'PGRST205') {
    return '成長旅程的 Supabase migration 尚未套用。'
  }
  return value.message || '無法讀取成長旅程，請稍後再試。'
}

export function useHuddleGrowth({ workspaces, scratchpadByDate }: UseHuddleGrowthArgs) {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [days, setDays] = useState<GrowthDay[]>([])
  const [achievements, setAchievements] = useState<GrowthAchievement[]>([])
  const [journeys, setJourneys] = useState<GrowthJourney[]>([])
  const [journeyDays, setJourneyDays] = useState<GrowthJourneyDay[]>([])
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const syncSignatureRef = useRef('')
  const backfillSignatureRef = useRef('')

  const allTasks = useMemo(
    () => workspaces.flatMap((workspace) => workspace.categories.flatMap((category) => category.tasks)),
    [workspaces]
  )
  const today = toDateString(new Date())

  useEffect(() => {
    const refresh = (detail?: PomodoroDayCount) => {
      const next = detail ?? loadPomodoroCount()
      setPomodoroCount(next.date === toDateString(new Date()) ? next.count : 0)
    }
    refresh()
    const onPomodoro = (event: Event) => refresh((event as CustomEvent<PomodoroDayCount>).detail)
    const onStorage = () => refresh()
    window.addEventListener(HUDDLE_POMODORO_COUNT_EVENT, onPomodoro)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(HUDDLE_POMODORO_COUNT_EVENT, onPomodoro)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const todayMetrics = useMemo(() => {
    const plannedCount = allTasks.filter(
      (task) => !task.isArchived && (task.scheduledDate === today || task.dueDate === today)
    ).length
    const completedCount = allTasks.filter((task) => {
      if (!task.isCompleted || !task.completedAt) return false
      return toDateString(new Date(task.completedAt)) === today
    }).length
    const reflectionCount = (scratchpadByDate[today] ?? []).filter((item) => {
      if (item.type === 'todo') return Boolean(item.content.trim() || item.title?.trim())
      return Boolean(item.content.trim())
    }).length
    const focusMinutes = pomodoroCount * 25
    return {
      plannedCount,
      completedCount,
      reflectionCount,
      focusMinutes,
      footprintEarned: plannedCount + completedCount + reflectionCount + focusMinutes > 0,
    }
  }, [allTasks, pomodoroCount, scratchpadByDate, today])

  // Recover meaningful activity from data that already exists before this
  // feature was installed. Counts only ever move upward during backfill, so
  // an archived/deleted task cannot erase a footprint previously synced.
  const historicActivity = useMemo(() => {
    const fromDate = dateDaysAgo(364)
    const planned = new Map<string, Set<string>>()
    const completed = new Map<string, number>()
    const reflected = new Map<string, number>()

    const addPlanned = (date: string | undefined, taskId: string) => {
      if (!date || date < fromDate || date > today) return
      const ids = planned.get(date) ?? new Set<string>()
      ids.add(taskId)
      planned.set(date, ids)
    }
    for (const task of allTasks) {
      addPlanned(task.scheduledDate, task.id)
      addPlanned(task.dueDate, task.id)
      if (task.isCompleted && task.completedAt) {
        const completedDate = toDateString(new Date(task.completedAt))
        if (completedDate >= fromDate && completedDate <= today) {
          completed.set(completedDate, (completed.get(completedDate) ?? 0) + 1)
        }
      }
    }
    for (const [date, items] of Object.entries(scratchpadByDate)) {
      if (date < fromDate || date > today) continue
      const count = items.filter((item) => Boolean(item.content.trim() || item.title?.trim())).length
      if (count > 0) reflected.set(date, count)
    }

    const dates = new Set([...planned.keys(), ...completed.keys(), ...reflected.keys()])
    return Array.from(dates).filter((date) => date !== today).sort().map((date) => ({
      date,
      plannedCount: planned.get(date)?.size ?? 0,
      completedCount: completed.get(date) ?? 0,
      reflectionCount: reflected.get(date) ?? 0,
    }))
  }, [allTasks, scratchpadByDate, today])

  const load = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setUserId(null)
      setError('登入後，Huddle 才能在不同裝置保存你的成長旅程。')
      setIsLoading(false)
      return
    }

    const nextUserId = userData.user.id
    setUserId(nextUserId)
    const fromDate = dateDaysAgo(365)
    const [daysResult, achievementsResult, journeysResult, journeyDaysResult] = await Promise.all([
      supabase.from('growth_days').select('*').gte('activity_date', fromDate).order('activity_date'),
      supabase.from('growth_achievements').select('*').order('unlocked_at'),
      supabase.from('growth_journeys').select('*').order('created_at', { ascending: false }),
      supabase.from('growth_journey_days').select('*').gte('entry_date', fromDate).order('entry_date'),
    ])

    const firstError = daysResult.error || achievementsResult.error || journeysResult.error || journeyDaysResult.error
    if (firstError) {
      setError(errorMessage(firstError))
      setIsLoading(false)
      return
    }

    setDays((daysResult.data ?? []).map(mapDay))
    setAchievements((achievementsResult.data ?? []).map(mapAchievement))
    setJourneys((journeysResult.data ?? []).map(mapJourney))
    setJourneyDays((journeyDaysResult.data ?? []).map(mapJourneyDay))
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    // load starts with Supabase auth I/O before it updates React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    await load()
  }, [load])

  useEffect(() => {
    if (!userId || isLoading || error) return
    const signature = JSON.stringify({ userId, today, ...todayMetrics })
    if (signature === syncSignatureRef.current) return
    syncSignatureRef.current = signature

    void (async () => {
      const now = new Date().toISOString()
      const { data, error: syncError } = await supabase
        .from('growth_days')
        .upsert(
          {
            user_id: userId,
            activity_date: today,
            planned_count: todayMetrics.plannedCount,
            completed_count: todayMetrics.completedCount,
            focus_minutes: todayMetrics.focusMinutes,
            reflection_count: todayMetrics.reflectionCount,
            footprint_earned: todayMetrics.footprintEarned,
            updated_at: now,
          },
          { onConflict: 'user_id,activity_date' }
        )
        .select()
        .single()

      if (syncError) {
        syncSignatureRef.current = ''
        setError(errorMessage(syncError))
        return
      }
      const mapped = mapDay(data)
      setDays((current) => [...current.filter((day) => day.activityDate !== today), mapped].sort(
        (a, b) => a.activityDate.localeCompare(b.activityDate)
      ))
    })()
  }, [error, isLoading, supabase, today, todayMetrics, userId])

  useEffect(() => {
    if (!userId || isLoading || error || historicActivity.length === 0) return
    const signature = JSON.stringify({ userId, historicActivity })
    if (signature === backfillSignatureRef.current) return
    backfillSignatureRef.current = signature
    const existingByDate = new Map(days.map((day) => [day.activityDate, day]))
    const changed = historicActivity.filter((snapshot) => {
      const existing = existingByDate.get(snapshot.date)
      return !existing
        || snapshot.plannedCount > existing.plannedCount
        || snapshot.completedCount > existing.completedCount
        || snapshot.reflectionCount > existing.reflectionCount
        || !existing.footprintEarned
    })
    if (changed.length === 0) return

    void (async () => {
      const now = new Date().toISOString()
      const { data, error: backfillError } = await supabase
        .from('growth_days')
        .upsert(
          changed.map((snapshot) => {
            const existing = existingByDate.get(snapshot.date)
            return {
              user_id: userId,
              activity_date: snapshot.date,
              planned_count: Math.max(existing?.plannedCount ?? 0, snapshot.plannedCount),
              completed_count: Math.max(existing?.completedCount ?? 0, snapshot.completedCount),
              focus_minutes: existing?.focusMinutes ?? 0,
              reflection_count: Math.max(existing?.reflectionCount ?? 0, snapshot.reflectionCount),
              footprint_earned: true,
              updated_at: now,
            }
          }),
          { onConflict: 'user_id,activity_date' }
        )
        .select()
      if (backfillError) {
        backfillSignatureRef.current = ''
        setError(errorMessage(backfillError))
        return
      }
      setDays((current) => {
        const byDate = new Map(current.map((day) => [day.activityDate, day]))
        for (const row of data ?? []) byDate.set(row.activity_date, mapDay(row))
        return Array.from(byDate.values()).sort((a, b) => a.activityDate.localeCompare(b.activityDate))
      })
    })()
  }, [days, error, historicActivity, isLoading, supabase, userId])

  useEffect(() => {
    if (!userId || isLoading || error) return
    const unlocked = new Set(achievements.map((achievement) => achievement.key))
    const context = { days, journeys }
    const newUnlocks = ACHIEVEMENT_DEFINITIONS.filter(
      (definition) => !unlocked.has(definition.key) && getAchievementProgress(definition, context) >= 100
    )
    if (newUnlocks.length === 0) return

    void (async () => {
      const { data, error: unlockError } = await supabase
        .from('growth_achievements')
        .upsert(
          newUnlocks.map((definition) => ({
            user_id: userId,
            achievement_key: definition.key,
            progress: 100,
          })),
          { onConflict: 'user_id,achievement_key', ignoreDuplicates: true }
        )
        .select()
      if (unlockError) {
        setError(errorMessage(unlockError))
        return
      }
      setAchievements((current) => {
        const byKey = new Map(current.map((achievement) => [achievement.key, achievement]))
        for (const row of data ?? []) byKey.set(row.achievement_key, mapAchievement(row))
        return Array.from(byKey.values()).sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt))
      })
    })()
  }, [achievements, days, error, isLoading, journeys, supabase, userId])

  const createJourney = useCallback(async (input: CreateJourneyInput) => {
    if (!userId) throw new Error('請先登入再開始旅程。')
    setIsSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const { data, error: createError } = await supabase
        .from('growth_journeys')
        .insert({
          user_id: userId,
          title: input.title.trim(),
          daily_step: input.dailyStep.trim(),
          duration_days: input.durationDays,
          start_date: toDateString(new Date()),
          status: 'active',
          updated_at: now,
        })
        .select()
        .single()
      if (createError) throw createError
      const mapped = mapJourney(data)
      setJourneys((current) => [mapped, ...current])
      return mapped
    } catch (createError) {
      const message = errorMessage(createError)
      setError(message)
      throw new Error(message)
    } finally {
      setIsSaving(false)
    }
  }, [supabase, userId])

  const toggleTodayJourneyStep = useCallback(async (journey: GrowthJourney) => {
    if (!userId) throw new Error('請先登入再記下旅程。')
    setIsSaving(true)
    setError(null)
    try {
      const current = journeyDays.find(
        (entry) => entry.journeyId === journey.id && entry.entryDate === today
      )
      const nextComplete = !current?.isComplete
      const now = new Date().toISOString()
      const { data, error: toggleError } = await supabase
        .from('growth_journey_days')
        .upsert(
          {
            journey_id: journey.id,
            user_id: userId,
            entry_date: today,
            is_complete: nextComplete,
            completed_at: nextComplete ? now : null,
            updated_at: now,
          },
          { onConflict: 'user_id,journey_id,entry_date' }
        )
        .select()
        .single()
      if (toggleError) throw toggleError
      const mapped = mapJourneyDay(data)
      setJourneyDays((entries) => [
        ...entries.filter((entry) => !(entry.journeyId === journey.id && entry.entryDate === today)),
        mapped,
      ])
      return mapped
    } catch (toggleError) {
      const message = errorMessage(toggleError)
      setError(message)
      throw new Error(message)
    } finally {
      setIsSaving(false)
    }
  }, [journeyDays, supabase, today, userId])

  const completeJourney = useCallback(async (journey: GrowthJourney) => {
    if (!userId) throw new Error('請先登入再完成旅程。')
    setIsSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const { data, error: completeError } = await supabase
        .from('growth_journeys')
        .update({ status: 'completed', completed_at: now, updated_at: now })
        .eq('id', journey.id)
        .select()
        .single()
      if (completeError) throw completeError
      const mapped = mapJourney(data)
      setJourneys((current) => current.map((item) => item.id === mapped.id ? mapped : item))
      return mapped
    } catch (completeError) {
      const message = errorMessage(completeError)
      setError(message)
      throw new Error(message)
    } finally {
      setIsSaving(false)
    }
  }, [supabase, userId])

  const clearError = useCallback(() => setError(null), [])
  const activeJourney = journeys.find((journey) => journey.status === 'active') ?? null

  return {
    days,
    achievements,
    journeys,
    journeyDays,
    activeJourney,
    isLoading,
    isSaving,
    error,
    reload,
    clearError,
    createJourney,
    toggleTodayJourneyStep,
    completeJourney,
  }
}
