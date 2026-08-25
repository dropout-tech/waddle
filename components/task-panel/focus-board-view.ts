'use client'

import { useCallback, useMemo, useState } from 'react'
import type { Workspace } from '@/lib/types'
import {
  defaultCards,
  filterCards,
  resolveFocusBoard,
  STALE_AFTER_DAYS,
  type FocusCard,
  type FocusSettings,
  type FocusTier,
  type ResolvedCard,
  type ResolvedTier,
} from '@/lib/focus'

/**
 * Shared brain for the 任務重點 board — the desktop grid and the phone
 * overlay render different markup but must behave identically, so tiering,
 * density, search and pinning live here once.
 *
 * Nothing in this file re-ranks or re-tiers: `resolveFocusBoard` already did
 * that. It only decides *what is on screen* (which tiers are open, which
 * cards survive the query) and writes the two per-device preferences.
 */

/** Card vs. compact list. Per-device, like the panel's own density switch. */
export type FocusDensity = 'card' | 'compact'

export const DENSITY_STORAGE_KEY = 'waddle-focus-density-v1'
export const OTHER_COLLAPSED_STORAGE_KEY = 'waddle-focus-tier-other-v1'

type Translate = (text: string, vars?: Record<string, string | number>) => string

/** Stable empty array so `tiers` keeps its identity while searching. */
const EMPTY_TIERS: ResolvedTier[] = []

function readDensity(): FocusDensity {
  if (typeof window === 'undefined') return 'card'
  try {
    return localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'card'
  } catch {
    return 'card'
  }
}

/**
 * Only `other` collapses, and it starts collapsed — the whole point of the
 * tiers is that the bands which need a human are never hidden. Anything but
 * an explicit '0' means "collapsed", so a fresh device gets the short page.
 */
function readOtherCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(OTHER_COLLAPSED_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

/** Section heading for a tier. `other` gets its count from the caller. */
export function tierLabel(tier: FocusTier, t: Translate): string {
  switch (tier) {
    case 'pinned':
      return t('釘選')
    case 'attention':
      return t('需要注意')
    case 'stalled':
      return t('停滯')
    default:
      return t('其他')
  }
}

export type CardStatusTone = 'overdue' | 'today' | 'quiet' | 'count'

export interface CardStatus {
  text: string
  tone: CardStatusTone
}

/**
 * The one right-aligned status word on a compact row.
 *
 * Priority mirrors lib/focus.ts's own tiering (overdue → today → stalled),
 * so the label can never contradict the band the card sits in. `today` is
 * read off the card's own top tasks rather than the tier, because a *pinned*
 * card is in the `pinned` band no matter how urgent it is — and "今天" is
 * exactly what its owner pinned it to see.
 */
export function cardStatus(card: ResolvedCard, todayStr: string, t: Translate): CardStatus {
  if (card.overdueCount > 0) {
    return { text: t('{count} 個逾期', { count: card.overdueCount }), tone: 'overdue' }
  }
  if (card.tasks.some((task) => task.scheduledDate === todayStr || task.dueDate === todayStr)) {
    return { text: t('今天'), tone: 'today' }
  }
  if (card.quietDays !== undefined && card.quietDays >= STALE_AFTER_DAYS) {
    return { text: t('{days} 天沒動靜', { days: card.quietDays }), tone: 'quiet' }
  }
  return { text: t('{count} 件', { count: card.totalCount }), tone: 'count' }
}

/** True when this card has been quiet long enough to earn the muted marker. */
export function isStale(card: ResolvedCard): boolean {
  return card.quietDays !== undefined && card.quietDays >= STALE_AFTER_DAYS
}

export interface CardMarker {
  key: 'overdue' | 'today' | 'stale'
  text: string
  tone: 'overdue' | 'quiet'
}

/**
 * The footnote row on a card — *why* this card sits in the band it sits in.
 *
 * The board is aimed at people who don't rank their own work: the tiers do
 * the judging for them, so a card that lands in 需要注意 without saying why
 * makes them reverse-engineer the rule. Hence the invariant enforced here:
 * **every card in 需要注意 returns at least one marker.** The last-resort
 * countless "今天到期" covers the one case the top-3 task slice can miss (a
 * low-urgency task whose *due* date is today, pushed out of the slice by
 * higher-urgency siblings).
 */
export function cardMarkers(card: ResolvedCard, todayStr: string, t: Translate): CardMarker[] {
  const markers: CardMarker[] = []
  if (card.overdueCount > 0) {
    markers.push({
      key: 'overdue',
      text: t('{count} 個逾期', { count: card.overdueCount }),
      tone: 'overdue',
    })
  }
  const dueToday = card.tasks.filter(
    (task) => task.scheduledDate === todayStr || task.dueDate === todayStr
  ).length
  if (dueToday > 0) {
    markers.push({ key: 'today', text: t('今天到期 {count} 個', { count: dueToday }), tone: 'overdue' })
  }
  if (markers.length === 0 && card.tier === 'attention') {
    markers.push({ key: 'today', text: t('今天到期'), tone: 'overdue' })
  }
  if (isStale(card)) {
    markers.push({
      key: 'stale',
      text: t('{days} 天沒動靜', { days: card.quietDays ?? STALE_AFTER_DAYS }),
      tone: 'quiet',
    })
  }
  return markers
}

interface UseFocusBoardViewArgs {
  focus: FocusSettings
  workspaces: Workspace[]
  todayStr: string
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void
}

export interface FocusBoardView {
  /** The bands, in render order. Empty while a search is running. */
  tiers: ResolvedTier[]
  /** True while the search box has content — the board switches to a flat list. */
  searching: boolean
  /** Search hits, most pressing first. Empty unless `searching`. */
  results: ResolvedCard[]
  /** True when the board itself is empty (no cards at all, search aside). */
  isEmpty: boolean
  /** True when a query is active but matched nothing. */
  noMatches: boolean
  query: string
  setQuery: (q: string) => void
  density: FocusDensity
  setDensity: (d: FocusDensity) => void
  otherCollapsed: boolean
  toggleOther: () => void
  /** `other` is the only collapsible tier. */
  isTierOpen: (tier: FocusTier) => boolean
  canPin: boolean
  togglePin: (categoryId: string) => void
}

export function useFocusBoardView({
  focus,
  workspaces,
  todayStr,
  onSetFocusBoard,
}: UseFocusBoardViewArgs): FocusBoardView {
  const [density, setDensityState] = useState<FocusDensity>(readDensity)
  const [otherCollapsed, setOtherCollapsedState] = useState<boolean>(readOtherCollapsed)
  const [query, setQuery] = useState('')

  const setDensity = useCallback((next: FocusDensity) => {
    setDensityState(next)
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next)
    } catch {
      /* private mode — in-memory only */
    }
  }, [])

  const toggleOther = useCallback(() => {
    setOtherCollapsedState((prev) => {
      const next = !prev
      try {
        localStorage.setItem(OTHER_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* private mode — in-memory only */
      }
      return next
    })
  }, [])

  const allTiers = useMemo(
    () => resolveFocusBoard(focus, workspaces, { today: todayStr }),
    [focus, workspaces, todayStr]
  )

  const searching = query.trim().length > 0

  /**
   * Searching drops the bands entirely and shows one flat "搜尋結果" list.
   *
   * Keeping the bands while filtering read wrong: a single hit landed under
   * a heading saying 「其他 1」, i.e. the board answered "this is unimportant"
   * to a question the user had just asked out loud. Flattening in tier order
   * keeps the most pressing hit on top anyway.
   */
  const results = useMemo(
    () => (searching ? allTiers.flatMap((tier) => filterCards(tier.cards, query)) : []),
    [allTiers, query, searching]
  )
  const tiers = searching ? EMPTY_TIERS : allTiers

  /**
   * Pinning writes `cards[].pinned`. An uncurated board has no `cards` array
   * at all, so materialise `defaultCards` first — otherwise the very first
   * pin would save an empty board and wipe the page.
   */
  const togglePin = useCallback(
    (categoryId: string) => {
      if (!onSetFocusBoard) return
      const base = focus.cards ?? defaultCards(workspaces, todayStr)
      const next: FocusCard[] = base.map((card) =>
        card.categoryId === categoryId ? { ...card, pinned: !card.pinned } : card
      )
      void onSetFocusBoard({ ...focus, cards: next })
    },
    [focus, workspaces, todayStr, onSetFocusBoard]
  )

  // 其他 is the only collapsible band. (A search no longer needs to force it
  // open — searching replaces the bands with a flat result list.)
  const isTierOpen = useCallback(
    (tier: FocusTier) => tier !== 'other' || !otherCollapsed,
    [otherCollapsed]
  )

  return {
    tiers,
    searching,
    results,
    isEmpty: allTiers.length === 0,
    noMatches: searching && results.length === 0,
    query,
    setQuery,
    density,
    setDensity,
    otherCollapsed,
    toggleOther,
    isTierOpen,
    canPin: !!onSetFocusBoard,
    togglePin,
  }
}
