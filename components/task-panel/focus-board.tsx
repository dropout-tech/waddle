'use client'

import { useState } from 'react'
import {
  ChevronRight,
  LayoutGrid,
  List,
  ListTree,
  Pin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
 * The 任務重點 tab of the full-screen task view.
 *
 * Three display modes, chosen with the toolbar switch:
 *
 *   大綱 (default) — the plain 一覽表 the user specified verbatim: workspace
 *     heading, then 標題：／當前進展：／任務： 1. 2. 3. for every category, all
 *     at one type size, nothing collapsed, nothing re-ranked. See
 *     focus-outline.tsx, which owns the format for both desktop and phone.
 *   卡片 / 精簡 — the tiered views below, unchanged.
 *
 * 大綱 is the default because the question this page answers for its owner is
 * "where does every line of work stand", and a board that sorts, sizes and
 * hides on his behalf keeps answering a different one.
 *
 * Reading order in the tiered modes is deliberate and single-protagonist
 * (DESIGN.md):
 *   1. `FocusBlock variant="page"` — the loudest thing on the page (text-2xl).
 *   2. a hairline + the quiet toolbar (search · density · 編輯版面).
 *   3. tier headings (釘選／需要注意／停滯／其他), each carrying flat cards.
 * Cards are flat by design: a card inside a card is banned, so the tasks
 * inside one are plain hover rows, not boxes.
 *
 * Why tiers instead of one wall of workspace sections: the board covers every
 * category with open work, so on a busy account the page got long enough that
 * "what needs me today" drowned. Only `other` collapses — hiding a band that
 * needs a human would trade a long page for a missed task, which is the worse
 * failure. `other` is the only band that groups by workspace: it is the long
 * one, and headings make it browsable; the urgent bands stay flat so their
 * order reads as "most pressing first".
 *
 * All ranking/grouping/filtering lives in lib/focus.ts and the density/search
 * state in focus-board-view.ts — this file only renders what they hand back.
 */

interface FocusBoardProps {
  workspaces: Workspace[]
  focus: FocusSettings
  /** Local date string, passed in so the board rolls over with the page. */
  todayStr: string
  onSelectTask: (task: Task) => void
  /** Narrow settings mutation; omitted ⇒ the board is read-only. */
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void
}

export function FocusBoard({
  workspaces,
  focus,
  todayStr,
  onSelectTask,
  onSetFocusBoard,
}: FocusBoardProps) {
  const { t } = useI18n()
  const [editorOpen, setEditorOpen] = useState(false)
  const view = useFocusBoardView({ focus, workspaces, todayStr, onSetFocusBoard })
  const outline = view.density === 'outline'

  return (
    <div data-testid="focus-board">
      {/* 當前重點 is a text-2xl headline — 1.7× the outline's body size, and the
          user's spec starts straight at the workspace name. In 大綱 mode it is
          not rendered at all; the two tiered modes keep it. */}
      {!outline && (
        <FocusBlock
          variant="page"
          // The board below lists this category's queue already — no echo.
          showNextTasks={false}
          workspaces={workspaces}
          focus={focus}
          todayStr={todayStr}
          onSelectTask={onSelectTask}
          onSetFocusBoard={onSetFocusBoard}
        />
      )}

      {/* Section break: the board below is a different kind of answer than the
          headline above it, so it gets a hairline rather than another card.
          With no headline above (大綱), there is nothing to break away from. */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2',
          outline ? 'pb-1' : 'mt-8 border-t border-border pt-5'
        )}
      >
        <p className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('分類看板')}
        </p>

        <div className="relative min-w-[160px] flex-1 md:max-w-[240px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden="true"
          />
          <input
            type="text"
            value={view.query}
            onChange={(e) => view.setQuery(e.target.value)}
            aria-label={t('搜尋大項目')}
            placeholder={t('搜尋大項目')}
            data-testid="focus-board-search"
            className="h-9 w-full rounded-lg bg-muted/50 pl-8 pr-8 text-sm text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {view.query && (
            <button
              type="button"
              onClick={() => view.setQuery('')}
              aria-label={t('清除')}
              data-testid="focus-board-search-clear"
              className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <DensityToggle value={view.density} onChange={view.setDensity} />

        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          data-testid="focus-board-edit"
          className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {t('編輯版面')}
        </button>
      </div>

      {view.isEmpty ? (
        <div className="mt-6 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-foreground">{t('還沒挑要追蹤的分類')}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t('挑幾個分類放上來，這裡就會列出它們接下來的幾件事。')}
          </p>
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="mt-5 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[filter] duration-150 ease-quart hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10"
          >
            {t('選擇分類')}
          </button>
        </div>
      ) : view.noMatches ? (
        <div
          data-testid="focus-board-no-match"
          className="mt-6 rounded-xl border border-dashed border-border px-6 py-12 text-center"
        >
          <p className="text-sm text-foreground">{t('沒有符合的大項目')}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('換個關鍵字，或清除搜尋。')}</p>
        </div>
      ) : view.density === 'outline' ? (
        // No tier branch here on purpose: 大綱 shows every card, always.
        // Search just narrows the same list in place.
        <FocusOutline
          className="mt-6"
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
        // A search answers a question the user just asked — filing the hits
        // back under 「其他 1」 would answer a different one.
        <section className="mt-6" data-testid="focus-search-results">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
              {t('搜尋結果')}
            </h2>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {view.results.length}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <CardLayout
            cards={view.results}
            density={view.density}
            todayStr={todayStr}
            showWorkspace
            canPin={view.canPin}
            onTogglePin={view.togglePin}
            onSelectTask={onSelectTask}
          />
        </section>
      ) : (
        <div className="mt-6 space-y-7">
          {view.tiers.map(({ tier, cards }) => {
            const open = view.isTierOpen(tier)
            return (
              <section key={tier} data-focus-tier={tier}>
                <TierHeading
                  tier={tier}
                  count={cards.length}
                  open={open}
                  onToggle={tier === 'other' ? view.toggleOther : undefined}
                />

                {open &&
                  (tier === 'other' ? (
                    // The long band: workspace headings make dozens of cards
                    // browsable. The urgent bands above stay flat on purpose.
                    <div className="space-y-5">
                      {groupCardsByWorkspace(cards, workspaces).map((group) => (
                        <section key={group.workspaceId} data-focus-group={group.workspaceId}>
                          <WorkspaceHeading name={group.workspaceName} color={group.workspaceColor} />
                          <CardLayout
                            cards={group.cards}
                            density={view.density}
                            todayStr={todayStr}
                            showWorkspace={false}
                            canPin={view.canPin}
                            onTogglePin={view.togglePin}
                            onSelectTask={onSelectTask}
                          />
                        </section>
                      ))}
                    </div>
                  ) : (
                    <CardLayout
                      cards={cards}
                      density={view.density}
                      todayStr={todayStr}
                      showWorkspace
                      canPin={view.canPin}
                      onTogglePin={view.togglePin}
                      onSelectTask={onSelectTask}
                    />
                  ))}
              </section>
            )
          })}
        </div>
      )}

      {/* Mounted only while open, like the focus editor: the form seeds its
          state from `settings.cards` in useState initializers, so a stale
          mount would show yesterday's selection after a save. */}
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

/** Three quiet icon buttons — a segmented control would out-shout the board. */
function DensityToggle({
  value,
  onChange,
}: {
  value: FocusDensity
  onChange: (next: FocusDensity) => void
}) {
  const { t } = useI18n()
  // 大綱 first: it is the default, and the switch should read left-to-right
  // as "the overview, or one of the two summarised views".
  const options: Array<{ key: FocusDensity; label: string; Icon: typeof LayoutGrid }> = [
    { key: 'outline', label: t('大綱'), Icon: ListTree },
    { key: 'card', label: t('卡片'), Icon: LayoutGrid },
    { key: 'compact', label: t('精簡'), Icon: List },
  ]
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          aria-label={label}
          title={label}
          data-testid={`focus-density-${key}`}
          className={cn(
            'flex size-8 items-center justify-center rounded-md transition-colors duration-150 ease-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === key
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function TierHeading({
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
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-quart',
            open && 'rotate-90'
          )}
          aria-hidden="true"
        />
      )}
      {/* Only 需要注意 wears the terracotta: four identically grey headings
          would ask the reader to rank the bands, which is the very job the
          board took off their hands. */}
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
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('超過 {days} 天沒有動靜', { days: STALE_AFTER_DAYS })}
        </span>
      )}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </>
  )

  // The whole heading row is the hit area, hairline included — a 14px
  // chevron is a poor target, and on a busy page it can end up under a
  // floating control.
  return onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid={`focus-tier-toggle-${tier}`}
      className="-ml-1.5 mb-3 flex min-h-9 w-[calc(100%+0.75rem)] items-center gap-2 rounded-lg px-1.5 transition-colors duration-150 ease-quart hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </button>
  ) : (
    <div className="mb-3 flex items-center gap-2">{inner}</div>
  )
}

function WorkspaceHeading({ name, color }: { name: string; color: string }) {
  const displayColor = useDisplayColor()
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: displayColor(color) || 'var(--muted-foreground)' }}
        aria-hidden="true"
      />
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {name}
      </p>
    </div>
  )
}

interface LayoutProps {
  cards: ResolvedCard[]
  density: FocusDensity
  todayStr: string
  showWorkspace: boolean
  canPin: boolean
  onTogglePin: (categoryId: string) => void
  onSelectTask: (task: Task) => void
}

function CardLayout({ cards, density, ...rest }: LayoutProps) {
  if (density === 'compact') {
    return (
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        {cards.map((card, index) => (
          <li key={card.categoryId} className={cn(index > 0 && 'border-t border-border/60')}>
            <CompactRow card={card} {...rest} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    // items-start: a card is as tall as its own content. Stretching them to
    // the tallest sibling put 40% dead space under the short ones, which ate
    // the vertical budget the tiers were introduced to save.
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <BoardCard key={card.categoryId} card={card} {...rest} />
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

/** One 36px line per category — the whole point of compact mode. */
function CompactRow({
  card,
  todayStr,
  showWorkspace,
  canPin,
  onTogglePin,
  onSelectTask,
}: Omit<LayoutProps, 'cards' | 'density'> & { card: ResolvedCard }) {
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
        className="flex h-9 min-w-0 flex-1 items-center gap-2.5 px-3 text-left transition-colors duration-150 ease-quart hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: displayColor(card.workspaceColor) || 'var(--muted-foreground)' }}
          aria-hidden="true"
        />
        <span
          data-focus-card-title
          className="max-w-[38%] shrink-0 truncate text-sm font-medium text-foreground"
        >
          {card.categoryName}
        </span>
        {showWorkspace && (
          <span className="hidden max-w-[20%] shrink-0 truncate text-xs text-muted-foreground/70 xl:inline">
            {card.workspaceName}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{secondary}</span>
        <span className={cn('shrink-0 text-xs tabular-nums', TONE_CLASS[status.tone])}>
          {status.text}
        </span>
      </button>
      <PinButton
        pinned={card.pinned}
        name={card.categoryName}
        canPin={canPin}
        onToggle={() => onTogglePin(card.categoryId)}
        className="size-9 shrink-0"
      />
    </div>
  )
}

function BoardCard({
  card,
  todayStr,
  showWorkspace,
  canPin,
  onTogglePin,
  onSelectTask,
}: Omit<LayoutProps, 'cards' | 'density'> & { card: ResolvedCard }) {
  const { t } = useI18n()
  const displayColor = useDisplayColor()
  const markers = cardMarkers(card, todayStr, t)
  const hasFooter = card.remainingCount > 0 || markers.length > 0

  return (
    <div
      data-focus-card={card.categoryId}
      className="group rounded-xl border border-border bg-card p-4"
    >
      {/* Category name stays quiet: on a curated board the user already knows
          which categories are up here — the note and the tasks are the news. */}
      <div className="flex items-start gap-1.5">
        <p
          data-focus-card-title
          className="-mt-0.5 flex min-w-0 flex-1 items-center gap-1.5 truncate pt-0.5 text-xs font-medium text-muted-foreground"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: displayColor(card.workspaceColor) || 'var(--muted-foreground)',
            }}
            aria-hidden="true"
          />
          <span className="truncate">{card.categoryName}</span>
          {showWorkspace && (
            <span className="shrink-0 truncate opacity-60">· {card.workspaceName}</span>
          )}
        </p>
        <PinButton
          pinned={card.pinned}
          name={card.categoryName}
          canPin={canPin}
          onToggle={() => onTogglePin(card.categoryId)}
          className={cn(
            '-mr-1.5 -mt-1.5 size-9 shrink-0',
            // Quiet until wanted; a pinned card keeps its pin on screen so the
            // state is never invisible.
            !card.pinned && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          )}
        />
      </div>

      {card.note && (
        <p className="mt-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">
          {card.note}
        </p>
      )}

      {card.tasks.length > 0 ? (
        <ul className={cn(card.note ? 'mt-2' : 'mt-1')}>
          {card.tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onSelectTask(task)}
                className="-mx-2 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
              >
                <span
                  className="size-1 shrink-0 rounded-full bg-current opacity-60"
                  aria-hidden="true"
                />
                <span className="truncate">{task.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn('text-sm text-muted-foreground', card.note ? 'mt-2' : 'mt-1')}>
          {t('這個分類都完成了 🐧')}
        </p>
      )}

      {hasFooter && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
          {card.remainingCount > 0 && (
            <span>{t('還有 {count} 個', { count: card.remainingCount })}</span>
          )}
          {/* Why this card is in this band. Terracotta for time pressure —
              never alarm red; muted grey for "quiet", which is not lateness. */}
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

function PinButton({
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
      title={pinned ? t('取消釘選') : t('釘選')}
      data-focus-pin
      className={cn(
        'flex items-center justify-center rounded-lg transition-colors duration-150 ease-quart hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pinned ? 'text-primary' : 'text-muted-foreground',
        className
      )}
    >
      <Pin className={cn('size-3.5', pinned && 'fill-current')} aria-hidden="true" />
    </button>
  )
}
