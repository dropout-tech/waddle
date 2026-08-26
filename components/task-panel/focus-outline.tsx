'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import { resolveFocus, type FocusSettings, type ResolvedBoardGroup, type ResolvedCard } from '@/lib/focus'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useI18n } from '@/lib/i18n/react'
import { isImeComposing } from '@/lib/ime'
import { FocusEditorModal } from '@/components/modals/focus-editor-modal'

/**
 * 大綱 mode — the 任務重點 board written out the way the user wrote it himself:
 *
 *     琢奧科技
 *     標題：九豆
 *     當前進展：推動金流物流
 *     任務：
 *     1. …  2. …  3. …
 *
 * Three rules this file exists to hold, all of them his words:
 *
 * 1. **每個層級都是一樣大的.** 標題／當前進展／任務 are all `text-sm`. What
 *    separates them is the muted label and a hairline under the workspace
 *    heading — never type size. Earlier versions of this board used size to
 *    rank things for him, which is exactly what he asked us to stop doing.
 * 2. **一覽全部.** No tiers, no collapsing, no "其他". Every chosen category
 *    is on screen, filed under its workspace, in his own board order.
 * 3. **The labels are literal.** 「標題：」「當前進展：」「任務：」 are printed,
 *    not implied by an icon or a layout convention — he wants to read the
 *    table, not decode it. Hence a 當前進展 line stays put even when empty:
 *    a missing row breaks the column he is scanning down.
 *
 * Shared by the desktop board and the phone board on purpose: the format is
 * the feature, so there is exactly one copy of it. `mobile` only widens touch
 * targets — it never changes what is printed.
 */

/** Same cap as 編輯版面's note field (focus-board-editor-modal.tsx). */
const MAX_NOTE_LENGTH = 40

interface FocusOutlineProps {
  groups: ResolvedBoardGroup[]
  /** Phone sizing: bigger tap targets, single column. */
  mobile?: boolean
  /** False on a read-only board — the note becomes plain text. */
  canEdit: boolean
  onSetNote: (categoryId: string, note: string) => void
  onSelectTask: (task: Task) => void
  /** Needed for the 當前重點 line: resolved here, edited through the modal. */
  focus: FocusSettings
  workspaces: Workspace[]
  todayStr: string
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void
  className?: string
}

export function FocusOutline({
  groups,
  mobile = false,
  canEdit,
  onSetNote,
  onSelectTask,
  focus,
  workspaces,
  todayStr,
  onSetFocusBoard,
  className,
}: FocusOutlineProps) {
  return (
    // ONE column, top to bottom, on every width. A second column was tried and
    // rejected: the user wrote a single running list and the word he used was
    // 「一覽」, and two columns make the eye finish a column then jump back up
    // to the top of the next one — the exact fragmenting he complained about.
    // Spare desktop width stays as margin. Do not re-introduce columns.
    <div data-testid="focus-outline" className={cn(className)}>
      {focus?.enabled && (
        <OutlineHeadline
          focus={focus}
          workspaces={workspaces}
          todayStr={todayStr}
          mobile={mobile}
          canEdit={canEdit}
          onSetFocusBoard={onSetFocusBoard}
        />
      )}

      {groups.map((group) => (
        <section
          key={group.workspaceId}
          data-focus-group={group.workspaceId}
          data-focus-outline-group
          className={cn(
            // Spacing is the *only* hierarchy tool left once every level shares
            // one type size, so the three gaps must stay ordered: line < entry
            // < workspace. On a phone the tap-target rule inflates every task
            // row to 44px, which would otherwise leave the gap *between* two
            // categories narrower than the gap between two of one category's
            // tasks — hence the stepped-up phone numbers.
            mobile ? 'mb-12 last:mb-0' : 'mb-8 last:mb-0'
          )}
        >
          <WorkspaceHeading name={group.workspaceName} color={group.workspaceColor} />
          <div className={cn(mobile ? 'space-y-8' : 'space-y-5')}>
            {group.cards.map((card) => (
              <OutlineEntry
                key={card.categoryId}
                card={card}
                mobile={mobile}
                canEdit={canEdit}
                onSetNote={onSetNote}
                onSelectTask={onSelectTask}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * 當前重點 — the one line the whole app is built around, printed at body size.
 *
 * It used to be a `text-2xl` card at the top of this tab. That card is why the
 * user said the levels weren't the same size, so here it is just another
 * labelled row in the same format as 標題／當前進展: same 14px, muted label,
 * bold value. Nothing else from the old card comes with it — no workspace ·
 * category · overdue meta line, no card, no hairline. He asked for the
 * sentence, not the dashboard.
 *
 * Clicking it opens the existing 設定當前重點 editor (auto / free text /
 * pinned task), which is what the old pencil button did.
 */
function OutlineHeadline({
  focus,
  workspaces,
  todayStr,
  mobile,
  canEdit,
  onSetFocusBoard,
}: {
  focus: FocusSettings
  workspaces: Workspace[]
  todayStr: string
  mobile: boolean
  canEdit: boolean
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void
}) {
  const { t } = useI18n()
  const [editorOpen, setEditorOpen] = useState(false)

  const global = useMemo(
    () =>
      resolveFocus(focus.global, workspaces, {
        scope: 'global',
        today: todayStr,
        // The board below is the list of follow-ups — no echo here.
        nextLimit: 0,
      }),
    [focus.global, workspaces, todayStr]
  )
  const title = global.source === 'empty' ? '' : global.title

  return (
    <>
      <p
        data-outline-row="headline"
        className={cn('flex items-center text-sm leading-6', mobile ? 'mb-8' : 'mb-6')}
      >
        <span className="mr-1 shrink-0 text-muted-foreground">{t('當前重點：')}</span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            data-outline-headline-edit
            aria-label={t('編輯當前重點')}
            className={cn(
              // Sized to its own text, not the full column: a hover band the
              // width of the page would read as a button, and this is a line
              // of the outline that happens to be editable.
              'min-w-0 -mx-1 truncate rounded px-1 text-left transition-colors duration-150 ease-quart hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              title ? 'font-medium text-foreground' : 'text-muted-foreground/60',
              // 44px on a phone. This row sits above the whole outline with a
              // margin under it, so growing it does not disturb the table's
              // rhythm the way a 44px 當前進展 row would.
              mobile ? 'flex min-h-11 items-center active:bg-muted/60' : 'inline-block'
            )}
          >
            {title || t('設定重點')}
          </button>
        ) : (
          <span className={cn('min-w-0 truncate', title ? 'font-medium text-foreground' : 'text-muted-foreground/60')}>
            {title || t('設定重點')}
          </span>
        )}
      </p>

      {editorOpen && (
        <FocusEditorModal
          isOpen
          target={{ scope: 'global' }}
          settings={focus}
          workspaces={workspaces}
          todayStr={todayStr}
          onClose={() => setEditorOpen(false)}
          onSave={onSetFocusBoard}
        />
      )}
    </>
  )
}

/**
 * The workspace 大標. Same 14px as everything below it — the dot, the weight
 * and the hairline are what say "this is a heading".
 */
function WorkspaceHeading({ name, color }: { name: string; color: string }) {
  const displayColor = useDisplayColor()
  return (
    <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-1.5">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: displayColor(color) || 'var(--muted-foreground)' }}
        aria-hidden="true"
      />
      <h2 data-outline-row="workspace" className="min-w-0 truncate text-sm font-semibold text-foreground">
        {name}
      </h2>
    </div>
  )
}

interface EntryProps {
  card: ResolvedCard
  mobile: boolean
  canEdit: boolean
  onSetNote: (categoryId: string, note: string) => void
  onSelectTask: (task: Task) => void
}

function OutlineEntry({ card, mobile, canEdit, onSetNote, onSelectTask }: EntryProps) {
  const { t } = useI18n()

  return (
    <div data-focus-card={card.categoryId} data-focus-outline-entry>
      <p data-outline-row="title" className="text-sm leading-6">
        <span className="mr-1 text-muted-foreground">{t('標題：')}</span>
        <span data-focus-card-title className="font-medium text-foreground">
          {card.categoryName}
        </span>
      </p>

      <OutlineNote card={card} mobile={mobile} canEdit={canEdit} onSetNote={onSetNote} />

      <p data-outline-row="tasks" className="text-sm leading-6 text-muted-foreground">
        {t('任務：')}
      </p>

      {card.tasks.length > 0 ? (
        <ol data-outline-task-list>
          {card.tasks.map((task, index) => (
            <li key={task.id}>
              <button
                type="button"
                data-focus-task-row
                onClick={() => onSelectTask(task)}
                className={cn(
                  '-mx-1.5 flex w-full items-center gap-1.5 rounded-md px-1.5 text-left text-sm leading-6 transition-colors duration-150 ease-quart hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mobile ? 'min-h-11 active:bg-muted/60' : 'py-0.5'
                )}
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
              </button>
            </li>
          ))}
          {/* No 「還有 N 個」 tail here: outline mode resolves with the task cap
              lifted (focus-board-view.ts), so this list is already complete.
              Summarising the overflow would be re-deciding what he gets to
              see, which is the whole thing this mode exists to stop doing. */}
        </ol>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">{t('這個分類都完成了 🐧')}</p>
      )}
    </div>
  )
}

/**
 * 當前進展 — a free-text note, edited in place.
 *
 * In place rather than "open 編輯版面": the note is the one column of this
 * table the user actually maintains, and sending him to a modal to change one
 * line means the overview stops being editable at a glance.
 *
 * The row never disappears when the note is empty. The placeholder is the
 * invitation *and* the column keeper.
 */
function OutlineNote({
  card,
  mobile,
  canEdit,
  onSetNote,
}: {
  card: ResolvedCard
  mobile: boolean
  canEdit: boolean
  onSetNote: (categoryId: string, note: string) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.note ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  // Esc unmounts the input; if a focusout still slipped through afterwards it
  // would write the draft we just threw away. One flag, checked in commit.
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const start = () => {
    cancelledRef.current = false
    setDraft(card.note ?? '')
    setEditing(true)
  }

  const commit = () => {
    if (cancelledRef.current) return
    setEditing(false)
    if ((card.note ?? '') !== draft.trim()) onSetNote(card.categoryId, draft)
  }

  const cancel = () => {
    cancelledRef.current = true
    setDraft(card.note ?? '')
    setEditing(false)
  }

  return (
    // Inline, not flex: the label and its value must read as one printed line
    // (and stay one text node for anyone reading the DOM), exactly like the
    // 標題 row above.
    <p data-outline-row="note" className="text-sm leading-6">
      <span className="mr-1 text-muted-foreground">{t('當前進展：')}</span>
      {editing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={draft}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (isImeComposing(e)) return
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') cancel()
            }}
            placeholder={t('這個分類現在推到哪了？')}
            aria-label={t('「{name}」的進度', { name: card.categoryName })}
            data-outline-note-input
            className="h-6 w-[min(100%,18rem)] rounded bg-muted/60 px-1 align-bottom text-sm leading-6 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {/* Says out loud what the three keys do — an inline editor with no
              visible commit button otherwise leaves the user guessing whether
              their typing was kept. Only on screen while editing. */}
          <span data-outline-note-hint className="ml-2 text-xs text-muted-foreground">
            {t('Enter 存檔・Esc 取消・點別處也會存')}
          </span>
        </>
      ) : canEdit ? (
        <button
          type="button"
          onClick={start}
          data-outline-note-edit
          aria-label={t('「{name}」的進度', { name: card.categoryName })}
          className={cn(
            // The tap target is grown with a pseudo-element rather than
            // padding: a 44px-tall note row would tower over the 24px lines
            // above and below it and wreck the table the user asked for.
            'relative -mx-1 max-w-full truncate rounded px-1 text-left align-bottom leading-6 transition-colors duration-150 ease-quart hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            card.note ? 'text-foreground' : 'text-muted-foreground/60',
            mobile &&
              "active:bg-muted/60 before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']"
          )}
        >
          {card.note || t('點一下寫下進展')}
        </button>
      ) : (
        <span className={cn(card.note ? 'text-foreground' : 'text-muted-foreground/60')}>
          {card.note || t('點一下寫下進展')}
        </span>
      )}
    </p>
  )
}
