'use client'

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { resolveGlobalDefaultCategory } from '@/lib/default-category'
import { useI18n } from '@/lib/i18n/react'
import { cn } from '@/lib/utils'
import { quickAddTitles } from '@/lib/widgets/quick-add'
import type { Workspace } from '@/lib/types'

/** Tallest the box grows (~6 lines) before it scrolls inside itself. */
const MAX_INPUT_HEIGHT = 144

interface QuickAddSheetProps {
  open: boolean
  onClose: () => void
  workspaces: Workspace[]
  /** `settings.defaultCategoryEnabled` — decides where an un-targeted task lands. */
  defaultCategoryEnabled: boolean
  /**
   * `addTask` from use-waddle-data: resolves `false` when the write was refused
   * (it has already toasted why); any other result counts as saved.
   */
  onAddTask: (categoryId: string, title: string) => unknown
}

/**
 * 快速新增任務 — the capture sheet behind the home-screen widget
 * (`huddle://widget/quick-add` → `/?widget=quick-add`, see use-widget-launch.ts).
 *
 * One box, one button: type a line, press Enter / 加入, and it becomes a task in
 * the default category with no date. Cancel / backdrop / Esc leave nothing
 * behind. On a phone it is a panel docked to the bottom edge (above the
 * keyboard); on desktop a small centered window. A failed save keeps the text.
 */
export function QuickAddSheet({ open, onClose, workspaces, defaultCategoryEnabled, onAddTask }: QuickAddSheetProps) {
  const isMobile = useIsMobile()
  const keyboardInset = useKeyboardInset()
  // Set while a save is in flight: the sheet must not be dismissed under it,
  // or a failure would have nowhere to put the text back.
  const busyRef = useRef(false)
  const composingRef = useRef(false)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busyRef.current) onClose() }}>
      <DialogPortal>
        <DialogOverlay className="bg-black/25 backdrop-blur-sm motion-reduce:backdrop-blur-none" />
        <DialogPrimitive.Content
          data-quick-add-sheet=""
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Take over focus so it lands in the box (Radix would pick the first
            // tabbable). In the iOS shell Capacitor allows a programmatic focus
            // to raise the keyboard (CAPBridgeViewController sets
            // keyboardShouldRequireUserInteraction(false)).
            e.preventDefault()
            document.querySelector<HTMLTextAreaElement>('[data-quick-add-input]')?.focus({ preventScroll: true })
          }}
          // A toast (e.g. the save-failed one) is "outside" the dialog; tapping
          // its × must not dismiss the sheet and throw the typed text away.
          onInteractOutside={(e) => {
            const target = e.target as Element | null
            if (target?.closest?.('[data-sonner-toaster]')) e.preventDefault()
          }}
          // Esc while an IME is composing only cancels the composition.
          onEscapeKeyDown={(e) => { if (composingRef.current) e.preventDefault() }}
          style={isMobile ? {
            bottom: keyboardInset,
            // The home-indicator inset is only needed when nothing (keyboard) sits below.
            paddingBottom: keyboardInset > 0 ? '0.75rem' : 'max(0.75rem, env(safe-area-inset-bottom))',
          } : undefined}
          className={cn(
            'fixed z-modal flex flex-col gap-3 border-border bg-card text-card-foreground shadow-2xl outline-none',
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out',
            'motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:fade-out-0 motion-safe:duration-200 motion-safe:ease-quart',
            isMobile
              ? 'inset-x-0 rounded-t-2xl border-t px-4 pt-4 motion-safe:data-[state=open]:slide-in-from-bottom motion-safe:data-[state=closed]:slide-out-to-bottom'
              : 'top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:zoom-out-95',
          )}
        >
          <QuickAddForm
            onClose={onClose}
            workspaces={workspaces}
            defaultCategoryEnabled={defaultCategoryEnabled}
            onAddTask={onAddTask}
            busyRef={busyRef}
            composingRef={composingRef}
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

/** Lives inside the dialog content, so its state is fresh on every open. */
function QuickAddForm({
  onClose, workspaces, defaultCategoryEnabled, onAddTask, busyRef, composingRef,
}: Omit<QuickAddSheetProps, 'open'> & {
  busyRef: MutableRefObject<boolean>
  composingRef: MutableRefObject<boolean>
}) {
  const { t, lang } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Where the task will land. `undefined` until the board has a usable category
  // (the sheet can be opened by a widget tap before the data has arrived): the
  // button then waits instead of writing to a wrong place.
  const dest = resolveGlobalDefaultCategory(workspaces, defaultCategoryEnabled)
  // Only the built-in 未分類 name is translated; the user's own names are left alone.
  const nameOf = (name: string) => (name === '未分類' ? t('未分類') : name)
  const place = dest
    ? dest.workspace.isDefault ? nameOf(dest.category.name) : `${nameOf(dest.workspace.name)} / ${nameOf(dest.category.name)}`
    : null
  const hasText = quickAddTitles(text).length > 0

  // Auto-grow: follow the content up to MAX_INPUT_HEIGHT, then scroll inside.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${Math.min(el.scrollHeight + border, MAX_INPUT_HEIGHT)}px`
  }, [text])

  const submit = async () => {
    if (busyRef.current || !dest || !place) return
    const titles = quickAddTitles(text)
    if (titles.length === 0) return
    busyRef.current = true
    setBusy(true)
    let saved = 0
    try {
      for (const title of titles) {
        let ok = false
        try {
          ok = (await onAddTask(dest.category.id, title)) !== false
        } catch (err) {
          console.error('[quick-add]', err)
          toast.error(t('儲存失敗：{op}', { op: t('新增任務') }))
        }
        if (!ok) break // addTask already told the user why
        saved++
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
    if (saved === titles.length) {
      toast.success(
        saved === 1
          ? t('已加入「{place}」', { place })
          : t('已加入 {n} 項任務到「{place}」', { n: saved, place }),
      )
      onClose()
      return
    }
    // Nothing is lost: what was not saved stays in the box.
    if (saved > 0) {
      setText(titles.slice(saved).join('\n'))
      toast(t('已加入 {n} 項，其餘還留在輸入框', { n: saved }))
    }
    inputRef.current?.focus({ preventScroll: true })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    // Picking a candidate in a Chinese / Japanese IME also reports Enter (and in
    // Safari keyCode 229 after compositionend) — that is not a submit.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void submit()
  }

  const addLabel = busy ? t('加入中…') : !dest ? t('準備中…') : lang === 'en' ? 'Add' : '加入'

  return (
    <>
      <DialogTitle className="text-sm font-semibold text-foreground">{t('新增任務')}</DialogTitle>
      <textarea
        ref={inputRef}
        data-quick-add-input=""
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        readOnly={busy}
        rows={1}
        enterKeyHint="done"
        autoCapitalize="sentences"
        placeholder={t('想到什麼，先記下來…')}
        aria-label={t('新增任務')}
        // 16px font: anything smaller makes iOS zoom the page when it is focused.
        className="block max-h-36 min-h-11 w-full resize-none overflow-y-auto rounded-xl border border-input bg-background px-3 py-2.5 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 read-only:opacity-70"
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {place ? t('放進「{place}」', { place }) : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl px-4 text-sm font-medium text-muted-foreground transition-[background-color,transform] hover:bg-secondary active:scale-[0.97] disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
        >
          {t('取消')}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!hasText || !dest || busy}
          className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
        >
          {addLabel}
        </button>
      </div>
    </>
  )
}
