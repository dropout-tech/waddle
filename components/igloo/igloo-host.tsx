'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/react'
import { computeIgloo, isSleepyHour, localDay, type IglooState } from '@/lib/igloo/compute'
import { catchUpLine, iglooDoneLine, iglooLine } from '@/lib/igloo/lines'
import { createIglooLedger, iglooStorageKey, ledgerTasks, readIglooLocal, writeActiveUser, writeIglooLocal, type IglooLocal } from '@/lib/igloo/local'
import { OPEN_IGLOO_EVENT, setIglooSnapshot } from '@/lib/igloo/store'
import { HUDDLE_POMODORO_COUNT_EVENT, loadPomodoroCount, type PomodoroDayCount } from '@/lib/pomodoro-count'
import { defaultPet, type PetSettings } from '@/lib/pet/types'
import type { Workspace } from '@/lib/types'
import { IglooScene, VILLAGE_MAX } from './igloo-scene'

/** Replay at most this many bricks; anything older is already up when the scene opens. */
const REPLAY_MAX = 40

/**
 * 企鵝的冰屋 — owner of the igloo state (mounted once in app/page.tsx).
 * Derives the bricks from the already-loaded tasks + this device's focus
 * log, publishes them for the growth card / pet / widget (lib/igloo/store),
 * and shows the igloo dialog when anything fires `huddle:open-igloo`.
 */
export function IglooHost({
  workspaces,
  pet,
  onSetPet,
}: {
  workspaces: Workspace[]
  pet: PetSettings | null | undefined
  onSetPet?: (next: PetSettings) => Promise<void> | void
}) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const state = useIglooState(workspaces, userId)

  // Signed out / another account: the old numbers go away at once.
  useEffect(() => {
    setIglooSnapshot(state, userId)
  }, [state, userId])

  const [open, setOpen] = useState(false)
  const [replay, setReplay] = useState<{ from: number; to: number; first: boolean } | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const onOpen = () => {
      const s = stateRef.current
      setOpen(true)
      if (!s || !userId) return setReplay(null)
      const local = readIglooLocal(userId)
      const first = local.seen === undefined
      const seen = first ? s.completedIgloos * s.bricksPerIgloo : Math.min(local.seen ?? 0, s.totalBricks)
      writeIglooLocal(userId, { ...local, seen: s.totalBricks })
      setReplay({ from: Math.max(seen, s.totalBricks - REPLAY_MAX), to: s.totalBricks, first })
    }
    window.addEventListener(OPEN_IGLOO_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_IGLOO_EVENT, onOpen)
  }, [userId])

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReplay(null) }}>
      {open && state && (
        <IglooDialog
          key={replay ? `${replay.from}-${replay.to}` : 'still'}
          state={state}
          replay={replay}
          pet={pet ?? null}
          onClose={() => { setOpen(false); setReplay(null) }}
          onAdopt={onSetPet}
        />
      )}
    </Dialog>
  )
}

/**
 * Live igloo numbers for this account (null until signed in).
 *
 * The ledger is read from localStorage once per account (and again only when
 * another tab changes it, or the day rolls over); everything after that is
 * in memory. The bricks are recomputed only when the set of completed tasks,
 * the pomodoro counter or the minute changes — not on every task edit.
 */
function useIglooState(workspaces: Workspace[], userId: string | null): IglooState | null {
  const [now, setNow] = useState(() => new Date())
  const [focusToday, setFocusToday] = useState<PomodoroDayCount>(() => loadPomodoroCount())
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const tick = () => {
      setNow(new Date())
      setFocusToday(loadPomodoroCount())
    }
    const onPomodoro = (e: Event) => {
      const detail = (e as CustomEvent<PomodoroDayCount>).detail
      setFocusToday(detail ?? loadPomodoroCount())
      setNow(new Date())
    }
    // Another tab (or window) wrote this account's ledger → read it again.
    const onStorage = (e: StorageEvent) => {
      if (userId && e.key === iglooStorageKey(userId)) setReloadKey((k) => k + 1)
    }
    const id = window.setInterval(tick, 60_000)
    window.addEventListener(HUDDLE_POMODORO_COUNT_EVENT, onPomodoro)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener(HUDDLE_POMODORO_COUNT_EVENT, onPomodoro)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [userId])

  // Completed tasks the app has loaded (archived ones too — the work still
  // happened), plus a cheap signature so the merge below only re-runs when
  // that set actually changes.
  const { liveDone, doneKey } = useMemo(() => {
    const out: { id: string; completedAt: string | null }[] = []
    let key = ''
    for (const ws of workspaces) for (const c of ws.categories) for (const t of c.tasks) {
      if (!t.isCompleted) continue
      out.push({ id: t.id, completedAt: t.completedAt ?? null })
      key += `${t.id}${t.completedAt ?? ''}|`
    }
    return { liveDone: out, doneKey: key }
  }, [workspaces])

  // This account's ledger: one localStorage read when the account becomes
  // active (again only for a new day or another tab's write), then in memory.
  // When another account used the device since, pomodoro counting restarts
  // from the device counter as it is now.
  const day = focusToday.date
  const ledger = useMemo(
    () => (userId ? createIglooLedger(userId, loadPomodoroCount()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` / `reloadKey` are re-read triggers
    [userId, day, reloadKey],
  )
  useEffect(() => {
    if (userId) writeActiveUser(userId)
  }, [userId])

  // Merge only when the completed-task set or the pomodoro counter changes
  // (not on every task edit); writes back only if something changed.
  useEffect(() => {
    ledger?.sync(liveDone, focusToday)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `liveDone` is keyed by `doneKey`; its identity changes on every task edit
  }, [ledger, doneKey, focusToday])

  const data = useSyncExternalStore(ledger?.subscribe ?? noSubscribe, ledger?.get ?? noLedger, noLedger)
  return useMemo(() => (data ? computeIgloo(ledgerTasks(data), data.focus, now) : null), [data, now])
}

const noSubscribe = () => () => {}
const noLedger = (): IglooLocal | null => null

function IglooDialog({
  state,
  replay,
  pet,
  onClose,
  onAdopt,
}: {
  state: IglooState
  replay: { from: number; to: number; first: boolean } | null
  pet: PetSettings | null
  onClose: () => void
  onAdopt?: (next: PetSettings) => Promise<void> | void
}) {
  const { t, lang } = useI18n()
  const per = state.bricksPerIgloo
  const adopted = !!pet?.adopted
  const look = adopted && pet ? pet : defaultPet(lang)
  const name = look.name || 'Huddle'

  const willReplay = !!replay && replay.to > replay.from
  const [shown, setShown] = useState(willReplay && replay ? replay.from : state.totalBricks)
  const [placing, setPlacing] = useState<number | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [hopKey, setHopKey] = useState(0)
  const [running, setRunning] = useState(willReplay)
  // At night the penguin finishes telling you the news before it dozes off.
  const [awake, setAwake] = useState(false)
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const seed = `${localDay(new Date())}:${name}`
  const moodLine = iglooLine(state, lang, seed)
  // The sky follows the real clock — a night-time replay happens under the moon.
  const night = isSleepyHour(new Date().getHours())

  const say = useCallback((text: string) => setBubble((b) => ({ text, key: (b?.key ?? 0) + 1 })), [])

  // The replay: one brick at a time from where you last looked, with a pause
  // and a little celebration whenever an igloo gets finished on the way.
  useEffect(() => {
    if (!replay) return
    const { from, to, first } = replay
    const news = to - (first ? 0 : from)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const done = () => {
      setPlacing(null)
      setRunning(false)
      setCelebrating(false)
      say(news > 0 ? catchUpLine(news, lang, first) : moodLine)
      if (news > 0 && state.mood === 'sleeping') {
        setAwake(true)
        timer.current = window.setTimeout(() => {
          setAwake(false)
          say(moodLine)
        }, reduced ? 0 : 2800)
      }
    }
    if (to <= from || reduced) {
      timer.current = window.setTimeout(() => {
        setShown(to)
        done()
      }, 0)
      return () => window.clearTimeout(timer.current)
    }
    const n = to - from
    const stepMs = n <= 10 ? 560 : Math.max(90, Math.floor(4800 / n))
    let cur = from
    const step = () => {
      cur += 1
      setShown(cur)
      setPlacing((cur - 1) % per)
      setHopKey((k) => k + 1)
      if (cur % per === 0) {
        setCelebrating(true)
        say(iglooDoneLine(cur / per, lang))
        timer.current = window.setTimeout(() => {
          if (cur < to) {
            setCelebrating(false)
            step()
          } else done()
        }, 2600)
        return
      }
      timer.current = window.setTimeout(cur < to ? step : done, cur < to ? stepMs : 650)
    }
    timer.current = window.setTimeout(step, 650)
    return () => window.clearTimeout(timer.current)
    // Runs once per opened dialog (the parent keys this component by the replay range).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = running ? shown : state.totalBricks
  const view = {
    completed: Math.floor(total / per),
    bricks: total % per,
    per,
    mood: running || awake ? ('building' as const) : state.mood,
  }
  const inProgress = view.bricks === 0 && view.completed > 0 && (celebrating || view.mood === 'proud') ? per : view.bricks
  const iglooNo = inProgress === per ? view.completed : view.completed + 1

  // The line under the scene matches what the penguin is doing: while it is
  // still up carrying (replay, or telling the night-time news) it talks about
  // the building, not about going to sleep.
  const shownLine = running || awake ? iglooLine({ ...state, mood: 'building' }, lang, seed) : moodLine

  const sceneLabel = t('冰屋場景：第 {n} 座冰屋蓋了 {x}/{per} 塊冰磚，村落裡有 {built} 座蓋好的冰屋。', { n: iglooNo, x: inProgress, per, built: view.completed })

  const adopt = async () => {
    if (!onAdopt) return
    await onAdopt({ ...defaultPet(lang), ...(pet ?? {}), adopted: true, enabled: true, adoptedAt: new Date().toISOString() })
    onClose()
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('huddle-pet:hello', { detail: { skipped: false } })), 450)
  }

  return (
    <DialogContent
      showCloseButton={false}
      // Focus the dialog itself, not the ✕ (no ring on open; Tab still reaches it).
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement | null)?.focus()
      }}
      className="max-h-[92dvh] gap-0 overflow-y-auto rounded-2xl p-0 outline-none sm:max-w-xl"
      data-igloo-dialog
      data-igloo-total={state.totalBricks}
      data-igloo-shown={total}
      data-igloo-mood={view.mood}
      data-igloo-replaying={running ? 'true' : 'false'}
      data-igloo-celebrating={celebrating ? 'true' : 'false'}
      data-igloo-awake={awake ? 'true' : 'false'}
      data-igloo-replay-count={willReplay && replay ? replay.to - replay.from : 0}
      data-igloo-today={state.bricksToday}
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <DialogTitle className="text-lg font-semibold tracking-tight">{t('企鵝的冰屋')}</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('每完成一個任務或一段專注，{name} 就搬一塊冰磚。{per} 塊蓋好一座。', { name, per })}
          </DialogDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('關閉')}
          className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="px-3 sm:px-5">
        <IglooScene
          view={view}
          look={look}
          bubble={bubble ? { name, text: bubble.text, key: bubble.key } : !replay ? { name, text: moodLine, key: 0 } : null}
          placing={running ? placing : null}
          celebrating={celebrating}
          hopKey={hopKey}
          night={night}
          label={sceneLabel}
        />
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">{t('第 {n} 座冰屋', { n: iglooNo })}</span>
          <span className="tabular-nums text-muted-foreground" data-igloo-progress>
            {t('{x} / {per} 塊', { x: inProgress, per })}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div
            className="h-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none"
            // terracotta in both themes (dark mode's primary is mustard)
            style={{ transform: `scaleX(${inProgress / per})`, background: '#c4552f' }}
          />
        </div>
        {/* The bubble carries the mood line unless it's busy with the catch-up news. */}
        {!!bubble && bubble.text !== shownLine && !running && <p className="mt-3 text-sm leading-6 text-foreground" data-igloo-line>{shownLine}</p>}
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('今天 +{n} 塊', { n: state.bricksToday })}
          <span aria-hidden="true" className="mx-2">·</span>
          {t('累積 {n} 塊', { n: state.totalBricks })}
          {state.completedIgloos > 0 && (
            <>
              <span aria-hidden="true" className="mx-2">·</span>
              {state.completedIgloos > VILLAGE_MAX ? t('村落共 {n} 座（畫面放最近 {m} 座）', { n: state.completedIgloos, m: VILLAGE_MAX }) : t('村落共 {n} 座', { n: state.completedIgloos })}
            </>
          )}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('冰磚只會增加，不會減少。休息幾天也沒關係，企鵝會等你。')}</p>

        {!adopted && (
          <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3" data-igloo-adopt>
            <p className="text-sm leading-6">{t('這隻企鵝還沒有主人。領養牠，牠就會住在你的角落，陪你把冰屋蓋起來。')}</p>
            {onAdopt && (
              <button
                type="button"
                onClick={() => void adopt()}
                className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('領養這隻企鵝')}
              </button>
            )}
          </div>
        )}
      </div>
    </DialogContent>
  )
}
