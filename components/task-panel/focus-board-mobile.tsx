'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Focus,
  LayoutGrid,
  List,
  ListTree,
  Pin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Task, Workspace } from '@/lib/types'
import {
  groupCardsByWorkspace,
  STALE_AFTER_DAYS,
  type FocusSettings,
  type FocusTier,
  type ResolvedCard,
} from '@/lib/focus'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useI18n } from '@/lib/i18n/react'
import { FocusBlock } from './focus-block'
import { FocusBoardEditorModal } from './focus-board-editor-modal'
import { FocusOutline } from './focus-outline'
import {
  cardMarkers,
  cardStatus,
  tierLabel,
  useFocusBoardView,
  type CardStatusTone,
  type FocusDensity,
} from './focus-board-view'

/**
 * The 任務重點 board, rebuilt for a phone.
 *
 * 大綱 mode (the default) is deliberately *not* re-cut for the phone: the
 * printed format 標題：／當前進展：／任務： is the feature, so both ends render
 * the same `FocusOutline`, single column here, with fatter tap targets. Only
 * the two tiered modes below get phone-specific markup.
 *
 * Not a narrow copy of `focus-board.tsx`: that one is a 1-3 column grid under
 * a `variant="page"` headline card, both sized for the desktop full-screen
 * view. On a 320-430px screen the same markup collapses into a grey column
 * where every line weighs the same. So the hierarchy is re-cut for one thumb:
 *
 *   headline (text-xl bold)          ← the one thing, on its own screenful
 *   search + density (sticky, 44px)  ← the two controls, always reachable
 *   ── 分類看板 hairline ──           ← chapter break
 *   tier heading (14px 600) + count  ← 釘選／需要注意／停滯／其他
 *      ● workspace label (11px)      ← only inside 其他, the long band
 *      card (full-bleed, p-5)        ← object, paper white
 *        category (11px uppercase)   ← quiet label
 *        note (text-base 600)        ← the card's protagonist
 *        task rows (≥44px, divided)  ← touch targets, not text
 *        還有 N 個 · N 個逾期 (12px)  ← footnote, terracotta for overdue
 *
 * Compact density swaps the cards for one ≥52px row per category — same
 * tiers, same grouping, ten times the scan rate.
 *
 * Cards stay flat (no card-in-a-card, DESIGN.md Container Rules); overdue uses
 * `text-urgency-critical` and "沒動靜" stays muted grey, so a stalled category
 * can never be mistaken for a late one.
 *
 * Layout note: this renders *inside* the mobile shell's content area (see
 * main-layout.tsx), which already applies `env(safe-area-inset-top)`, and the
 * bottom tab bar owns `env(safe-area-inset-bottom)`. Hence no safe-area
 * padding is re-applied here — doubling it would push the header down a
 * second notch's worth on iPhone.
 *
 * All ranking/grouping lives in lib/focus.ts and the density/search state in
 * focus-board-view.ts; this file only renders what they hand back.
 */

interface FocusBoardMobileProps {
  workspaces: Workspace[]
  focus: FocusSettings
  onSelectTask: (task: Task) => void
  /** Narrow settings mutation; omitted ⇒ the board is read-only. */
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void
  onClose: () => void
  className?: string
}

export function FocusBoardMobile({
  workspaces,
  focus,
  onSelectTask,
  onSetFocusBoard,
  onClose,
  className,
}: FocusBoardMobileProps) {
  const { t } = useI18n()
  const [editorOpen, setEditorOpen] = useState(false)

  // Same minute tick as task-panel.tsx so the board rolls over at local
  // midnight instead of freezing on the date it was opened.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])
  const todayStr = useMemo(() => toDateString(new Date()), [nowTick])

  const view = useFocusBoardView({ focus, workspaces, todayStr, onSetFocusBoard })
  const outline = view.density === 'outline'

  return (
    <div
      data-testid="focus-board-mobile"
      className={cn('flex min-h-0 flex-col bg-background', className)}
    >
      {/* Header — mirrors the journal/report focus header in main-layout so
          the phone has exactly one "full-screen surface" grammar. */}
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-border bg-card/50 px-2 py-1.5">
        <span className="flex items-center gap-2 pl-2">
          <Focus className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">{t('任務重點')}</span>
        </span>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          data-testid="focus-board-mobile-edit"
          className="ml-auto flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-quart active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {t('編輯版面')}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('關閉')}
          data-testid="focus-board-mobile-close"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-quart active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* Controls stay out of the scroll: a filter you have to scroll back up
          to reach is a filter nobody uses on a phone. */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden="true"
          />
          <input
            type="text"
            value={view.query}
            onChange={(e) => view.setQuery(e.target.value)}
            aria-label={t('搜尋大項目')}
            placeholder={t('搜尋大項目')}
            data-testid="focus-board-mobile-search"
            className="h-11 w-full rounded-xl bg-muted/50 pl-9 pr-10 text-sm text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {view.query && (
            <button
              type="button"
              onClick={() => view.setQuery('')}
              aria-label={t('清除')}
              data-testid="focus-board-mobile-search-clear"
              className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 ease-quart active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <MobileDensityToggle value={view.density} onChange={view.setDensity} />
      </div>

      {/* Scroll body. The bottom tab bar is a sibling below this element (not
          an overlay), so it can never cover a card; the generous pb-24 is
          there for the FocusTimer chip, which floats 78px above the viewport
          bottom on every mobile surface and would otherwise sit on the last
          card's footer row. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Same call as the desktop board: 大綱 starts at the workspace name,
            with no oversized headline above it. */}
        {!outline && (
          <FocusBlock
            variant="page-mobile"
            // The board below lists this category's queue already — no echo.
            showNextTasks={false}
            workspaces={workspaces}
            focus={focus}
            todayStr={todayStr}
            onSelectTask={onSelectTask}
            onSetFocusBoard={onSetFocusBoard}
          />
        )}

        <div className={cn('px-4 pb-24 pt-4', !outline && 'border-t border-border')}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('分類看板')}
          </p>

          {view.isEmpty ? (
            <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm text-foreground">{t('還沒挑要追蹤的分類')}</p>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {t('挑幾個分類放上來，這裡就會列出它們接下來的幾件事。')}
              </p>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                data-testid="focus-board-mobile-empty-pick"
                className="mt-5 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[filter] duration-150 ease-quart active:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('選擇分類')}
              </button>
            </div>
          ) : view.noMatches ? (
            <div
              data-testid="focus-board-mobile-no-match"
              className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center"
            >
              <p className="text-sm text-foreground">{t('沒有符合的大項目')}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t('換個關鍵字，或清除搜尋。')}</p>
            </div>
          ) : view.density === 'outline' ? (
            // Every card, always — search narrows this same list in place.
            <FocusOutline
              className="mt-5"
              mobile
              groups={view.outlineGroups}
              canEdit={view.canPin}
              onSetNote={view.setNote}
              onSelectTask={onSelectTask}
              focus={focus}
              workspaces={workspaces}
              todayStr={todayStr}
              onSetFocusBoard={onSetFocusBoard}
            />
          ) : view.searching ? (
            // Hits get their own heading: filing them back under 「其他」
            // would rank the thing the user just went looking for.
            <section className="mt-5" data-testid="focus-search-results-mobile">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
                  {t('搜尋結果')}
                </h2>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {view.results.length}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
              <MobileCardLayout
                cards={view.results}
                density={view.density}
                todayStr={todayStr}
                canPin={view.canPin}
                onTogglePin={view.togglePin}
                onSelectTask={onSelectTask}
              />
            </section>
          ) : (
            view.tiers.map(({ tier, cards }) => {
              const open = view.isTierOpen(tier)
              return (
                <section key={tier} data-focus-tier={tier} className="mt-6 first-of-type:mt-4">
                  <MobileTierHeading
                    tier={tier}
                    count={cards.length}
                    open={open}
                    onToggle={tier === 'other' ? view.toggleOther : undefined}
                  />

                  {open &&
                    (tier === 'other' ? (
                      <div className="space-y-5">
                        {groupCardsByWorkspace(cards, workspaces).map((group) => (
                          <section key={group.workspaceId} data-focus-group={group.workspaceId}>
                            <MobileWorkspaceHeading
                              name={group.workspaceName}
                              color={group.workspaceColor}
                            />
                            <MobileCardLayout
                              cards={group.cards}
                              density={view.density}
                              todayStr={todayStr}
                              canPin={view.canPin}
                              onTogglePin={view.togglePin}
                              onSelectTask={onSelectTask}
                            />
                          </section>
                        ))}
                      </div>
                    ) : (
                      <MobileCardLayout
                        cards={cards}
                        density={view.density}
                        todayStr={todayStr}
                        canPin={view.canPin}
                        onTogglePin={view.togglePin}
                        onSelectTask={onSelectTask}
                      />
                    ))}
                </section>
              )
            })
          )}
        </div>
      </div>

      {/* Mounted only while open — the editor seeds its state from
          `settings.cards` in useState initializers, so a stale mount would
          show yesterday's selection after a save. */}
      {editorOpen && (
        <FocusBoardEditorModal
          isOpen
          settings={focus}
          workspaces={workspaces}
          todayStr={todayStr}
          onClose={() => setEditorOpen(false)}
          onSave={onSetFocusBoard}
        />
      )}
    </div>
  )
}

function MobileDensityToggle({
  value,
  onChange,
}: {
  value: FocusDensity
  onChange: (next: FocusDensity) => void
}) {
  const { t } = useI18n()
  // Same order and same default as the desktop switch — 大綱 first.
  const options: Array<{ key: FocusDensity; label: string; Icon: typeof LayoutGrid }> = [
    { key: 'outline', label: t('大綱'), Icon: ListTree },
    { key: 'card', label: t('卡片'), Icon: LayoutGrid },
    { key: 'compact', label: t('精簡'), Icon: List },
  ]
  return (
    <div className="flex shrink-0 items-center rounded-xl bg-muted/50">
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          aria-label={label}
          data-testid={`focus-density-mobile-${key}`}
          className={cn(
            'flex size-11 items-center justify-center rounded-xl transition-colors duration-150 ease-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function MobileTierHeading({
  tier,
  count,
  open,
  onToggle,
}: {
  tier: FocusTier
  count: number
  open: boolean
  onToggle?: () => void
}) {
  const { t } = useI18n()
  const label = tierLabel(tier, t)

  const inner = (
    <>
      {onToggle && (
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-quart',
            open && 'rotate-90'
          )}
          aria-hidden="true"
        />
      )}
      {/* Only 需要注意 wears the terracotta — see focus-board.tsx. */}
      <h2
        className={cn(
          'shrink-0 text-sm font-semibold tracking-tight',
          tier === 'attention' ? 'text-urgency-critical' : 'text-foreground'
        )}
      >
        {label}
      </h2>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      {/* Statement of fact, not a nudge (DESIGN.md bans 催促 copy). */}
      {tier === 'stalled' && (
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {t('超過 {days} 天沒有動靜', { days: STALE_AFTER_DAYS })}
        </span>
      )}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </>
  )

  // Whole row is the target — a thumb deserves more than a 16px chevron.
  return onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid={`focus-tier-toggle-${tier}`}
      className="-ml-2 mb-3 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 transition-colors duration-150 ease-quart active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </button>
  ) : (
    <div className="mb-3 flex items-center gap-2">{inner}</div>
  )
}

function MobileWorkspaceHeading({ name, color }: { name: string; color: string }) {
  const displayColor = useDisplayColor()
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: displayColor(color) || 'var(--muted-foreground)' }}
        aria-hidden="true"
      />
      <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {name}
      </p>
    </div>
  )
}

interface MobileLayoutProps {
  cards: ResolvedCard[]
  density: FocusDensity
  todayStr: string
  canPin: boolean
  onTogglePin: (categoryId: string) => void
  onSelectTask: (task: Task) => void
}

function MobileCardLayout({ cards, density, ...rest }: MobileLayoutProps) {
  if (density === 'compact') {
    return (
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        {cards.map((card, index) => (
          <li key={card.categoryId} className={cn(index > 0 && 'border-t border-border/60')}>
            <MobileCompactRow card={card} {...rest} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <MobileBoardCard key={card.categoryId} card={card} {...rest} />
      ))}
    </div>
  )
}

const TONE_CLASS: Record<CardStatusTone, string> = {
  // Terracotta, never alarm red (DESIGN.md anti-patterns).
  overdue: 'text-urgency-critical',
  today: 'text-foreground',
  // Quiet is not late — it must not borrow the overdue colour.
  quiet: 'text-muted-foreground',
  count: 'text-muted-foreground',
}

/**
 * One category per row. Two text lines rather than one: at 390px a single
 * line would leave the note about seven glyphs of room, which is a truncated
 * ellipsis, not information. The row is still one tap target.
 */
function MobileCompactRow({
  card,
  todayStr,
  canPin,
  onTogglePin,
  onSelectTask,
}: Omit<MobileLayoutProps, 'cards' | 'density'> & { card: ResolvedCard }) {
  const { t } = useI18n()
  const displayColor = useDisplayColor()
  const status = cardStatus(card, todayStr, t)
  const secondary = card.note || card.tasks[0]?.title || t('這個分類都完成了 🐧')
  const top = card.tasks[0]

  return (
    <div data-focus-card={card.categoryId} data-focus-compact-row className="flex items-center">
      <button
        type="button"
        onClick={() => top && onSelectTask(top)}
        disabled={!top}
        className="flex min-h-[52px] min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pl-3 pr-1 text-left transition-colors duration-150 ease-quart active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
      >
        <span className="flex w-full items-center gap-2">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: displayColor(card.workspaceColor) || 'var(--muted-foreground)',
            }}
            aria-hidden="true"
          />
          <span
            data-focus-card-title
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          >
            {card.categoryName}
          </span>
          <span className={cn('shrink-0 text-xs tabular-nums', TONE_CLASS[status.tone])}>
            {status.text}
          </span>
        </span>
        <span className="w-full truncate pl-3.5 text-xs text-muted-foreground">{secondary}</span>
      </button>
      <MobilePinButton
        pinned={card.pinned}
        name={card.categoryName}
        canPin={canPin}
        onToggle={() => onTogglePin(card.categoryId)}
      />
    </div>
  )
}

function MobileBoardCard({
  card,
  todayStr,
  canPin,
  onTogglePin,
  onSelectTask,
}: Omit<MobileLayoutProps, 'cards' | 'density'> & { card: ResolvedCard }) {
  const { t } = useI18n()
  const displayColor = useDisplayColor()
  const markers = cardMarkers(card, todayStr, t)
  const hasFooter = card.remainingCount > 0 || markers.length > 0

  return (
    <div data-focus-card={card.categoryId} className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-2">
        <p
          data-focus-card-title
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: displayColor(card.workspaceColor) || 'var(--muted-foreground)',
            }}
            aria-hidden="true"
          />
          <span className="truncate">{card.categoryName}</span>
        </p>
        {/* Always visible on touch: there is no hover to reveal it. */}
        <MobilePinButton
          pinned={card.pinned}
          name={card.categoryName}
          canPin={canPin}
          onToggle={() => onTogglePin(card.categoryId)}
          className="-mr-2 -mt-2"
        />
      </div>

      {card.note && (
        <p className="mt-1 text-base font-semibold leading-snug text-foreground line-clamp-2">
          {card.note}
        </p>
      )}

      {card.tasks.length > 0 ? (
        // Hairlines between rows: on a phone each task is a target, and a
        // divided list reads as "three things I can tap", not a paragraph.
        <ul className={cn('-mx-1', card.note ? 'mt-3' : 'mt-1.5')}>
          {card.tasks.map((task, index) => (
            <li key={task.id} className={cn(index > 0 && 'border-t border-border/60')}>
              <button
                type="button"
                data-focus-task-row
                onClick={() => onSelectTask(task)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left transition-colors duration-150 ease-quart active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {task.title}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/50"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn('text-sm text-muted-foreground', card.note ? 'mt-3' : 'mt-1.5')}>
          {t('這個分類都完成了 🐧')}
        </p>
      )}

      {hasFooter && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
          {card.remainingCount > 0 && (
            <span>{t('還有 {count} 個', { count: card.remainingCount })}</span>
          )}
          {/* Why this card is in this band — terracotta for time pressure
              (never alarm red), muted grey for "quiet", which is not late. */}
          {markers.map((marker) => (
            <span
              key={marker.key}
              data-focus-marker={marker.key}
              className={marker.tone === 'overdue' ? 'text-urgency-critical' : 'text-muted-foreground'}
            >
              {marker.text}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function MobilePinButton({
  pinned,
  name,
  canPin,
  onToggle,
  className,
}: {
  pinned: boolean
  name: string
  canPin: boolean
  onToggle: () => void
  className?: string
}) {
  const { t } = useI18n()
  if (!canPin) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? t('取消釘選「{name}」', { name }) : t('釘選「{name}」', { name })}
      data-focus-pin
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-quart active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pinned ? 'text-primary' : 'text-muted-foreground/70',
        className
      )}
    >
      <Pin className={cn('size-4', pinned && 'fill-current')} aria-hidden="true" />
    </button>
  )
}
