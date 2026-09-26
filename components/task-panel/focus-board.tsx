"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { isImeComposing } from "@/lib/ime";
import { cn } from "@/lib/utils";
import type { Task, Workspace } from "@/lib/types";
import { defaultCards, type FocusCard, type FocusSettings } from "@/lib/focus";
import { useI18n } from "@/lib/i18n/react";
import { useDisplayColor } from "@/hooks/use-display-color";
import { FocusBoardEditorModal } from "./focus-board-editor-modal";

export interface FocusBoardProps {
  workspaces: Workspace[];
  focus: FocusSettings;
  todayStr: string;
  onSelectTask: (task: Task) => void;
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void;
  onToggleComplete?: (taskId: string) => void;
  onAddTask?: (categoryId: string, title: string) => void;
}

/** Category identities are authoritative; the board stores preferences and references only. */
export function FocusBoard(props: FocusBoardProps) {
  const { focus, workspaces, todayStr, onSetFocusBoard } = props;
  const { t } = useI18n();
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"card" | "list">(() => {
    try {
      return localStorage.getItem("waddle-focus-layout-v2") === "list"
        ? "list"
        : "card";
    } catch {
      return "card";
    }
  });
  const [saving, setSaving] = useState(false);
  const [taskViews, setTaskViews] = useState<Record<string, "preview" | "expanded" | "collapsed">>({});
  const cards = focus.cards ?? defaultCards(workspaces, todayStr);
  // `update()` below runs writes through a serial queue rather than
  // dropping a second card's edit while the first is still saving, so it
  // needs to read the *latest* cards/focus at the moment each queued write
  // actually executes — not whatever was in scope when it was queued.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const entries = cards
    .filter((c) => !c.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((card) => {
      const workspace = workspaces.find(
        (w) =>
          !w.isArchived &&
          w.categories.some((c) => c.id === card.categoryId && !c.isArchived),
      );
      const category = workspace?.categories.find(
        (c) => c.id === card.categoryId,
      );
      if (!workspace || !category) return [];
      const haystack = [
        workspace.name,
        category.name,
        card.status?.text,
        card.note,
        card.remarks,
        ...category.tasks.map((task) => task.title),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(query.trim().toLocaleLowerCase())
        ? [{ card, workspace, category }]
        : [];
    });
  // Serialize writes instead of dropping one when another card is mid-save.
  // `focus_board` is a single JSONB blob, so every write must be built from
  // the latest known cards (via the refs above) — never from a snapshot
  // taken before an earlier queued write landed — or two cards edited close
  // together would silently overwrite each other.
  function update(categoryId: string, patch: Partial<FocusCard>) {
    if (!onSetFocusBoard) return Promise.resolve();
    const run = saveQueueRef.current.then(async () => {
      setSaving(true);
      try {
        await onSetFocusBoard({
          ...focusRef.current,
          cards: cardsRef.current.map((c) =>
            c.categoryId === categoryId ? { ...c, ...patch } : c,
          ),
        });
      } finally {
        setSaving(false);
      }
    });
    // Keep the chain alive even if this write failed, so a later card's
    // edit still gets its turn instead of being stuck behind a rejection.
    saveQueueRef.current = run.catch(() => {});
    return run;
  }
  return (
    <div data-testid="focus-board" className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-semibold">{t("當前重點")}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => setTaskViews(Object.fromEntries(cards.map(c => [c.categoryId, "expanded"]))) } className="min-h-11 rounded-lg px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{t("全部展開")}</button>
          <button type="button" onClick={() => setTaskViews(Object.fromEntries(cards.map(c => [c.categoryId, "collapsed"]))) } className="min-h-11 rounded-lg px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{t("全部收起")}</button>
        </div>
        <input
          aria-label={t("搜尋分類或任務")}
          placeholder={t("搜尋分類或任務")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Search includes every task, so matching tasks beyond the preview
            // must be visible. Clearing search restores the compact default.
            setTaskViews(e.target.value.trim()
              ? Object.fromEntries(cards.map(c => [c.categoryId, "expanded"]))
              : {});
          }}
          className="h-11 min-w-0 flex-1 basis-48 rounded-lg border border-border bg-card px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex shrink-0 gap-1">
          {(["card", "list"] as const).map((value) => (
            <button
              key={value}
              aria-label={t(value === "card" ? "卡片" : "清單")}
              aria-pressed={layout === value}
              onClick={() => {
                setLayout(value);
                try {
                  localStorage.setItem("waddle-focus-layout-v2", value);
                } catch {}
              }}
              className={cn(
                "flex size-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-ring",
                layout === value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {value === "card" ? (
                <LayoutGrid className="size-4" />
              ) : (
                <List className="size-4" />
              )}
            </button>
          ))}
        </div>
        {onSetFocusBoard && (
          <button
            disabled={saving}
            onClick={() => setEditorOpen(true)}
            className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            <SlidersHorizontal className="size-4" />
            {t("編輯版面")}
          </button>
        )}
      </div>
      {entries.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          {t(query ? "沒有符合的分類或任務" : "從編輯版面選擇要顯示的分類")}
        </p>
      )}
      <div
        className={cn(
          "grid items-start gap-3",
          layout === "card" &&
            "grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))]",
        )}
      >
        {entries.map(({ card, workspace, category }) => (
          <ProgressCard
            key={category.id}
            {...props}
            card={card}
            workspace={workspace}
            category={category}
            saving={saving}
            taskView={taskViews[category.id] ?? "preview"}
            onTaskViewChange={(value) => setTaskViews(previous => ({ ...previous, [category.id]: value }))}
            onUpdate={(patch) => update(category.id, patch)}
          />
        ))}
      </div>
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
  );
}

function ProgressCard({
  card,
  workspace,
  category,
  saving,
  onUpdate,
  onSelectTask,
  onToggleComplete,
  onAddTask,
  onSetFocusBoard,
  taskView,
  onTaskViewChange,
}: FocusBoardProps & {
  card: FocusCard;
  workspace: Workspace;
  category: Workspace["categories"][number];
  saving: boolean;
  onUpdate: (patch: Partial<FocusCard>) => Promise<void>;
  taskView: "preview" | "expanded" | "collapsed";
  onTaskViewChange: (value: "preview" | "expanded" | "collapsed") => void;
}) {
  const { t } = useI18n();
  const displayColor = useDisplayColor();
  // Remarks are edited in place: the textarea *is* the remarks area. `editing`
  // is true while it holds a local draft that hasn't been committed yet.
  const [editing, setEditing] = useState(false);
  const [remarks, setRemarks] = useState("");
  // A draft brought back from an abrupt close (or a failed save) isn't
  // focused, so blur can't commit it — show an explicit save/discard row.
  const [restored, setRestored] = useState(false);
  const [creating, setCreating] = useState(false);
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  const tasks = category.tasks.filter(
    (task) => !task.isArchived && task.showInTaskList !== false,
  );
  // Current status is chosen from the task list below (◎ button); the card
  // only displays it. Never resolve a reference outside this category.
  const linked =
    card.status?.mode === "task"
      ? tasks.find((task) => task.id === card.status?.taskId)
      : undefined;
  // Legacy data: a typed status (`mode: "text"`) or the old `note` field is
  // still shown read-only so existing boards don't lose information.
  const statusText = card.status
    ? card.status.mode === "task"
      ? linked?.title
      : card.status.mode === "text"
        ? card.status.text
        : ""
    : card.note;
  const done = tasks.filter((task) => task.isCompleted).length;
  const sorted = tasks
    .filter((task) => card.showCompleted || !task.isCompleted)
    .sort((a, b) => {
      if (a.isCompleted !== b.isCompleted)
        return Number(a.isCompleted) - Number(b.isCompleted);
      switch (card.taskSort) {
        case "dueDate":
          return (
            (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
            a.sortOrder - b.sortOrder
          );
        case "urgency":
          return b.urgency - a.urgency || a.sortOrder - b.sortOrder;
        case "created":
          return b.createdAt.localeCompare(a.createdAt);
        default:
          return a.sortOrder - b.sortOrder;
      }
    });
  const editable = !!onSetFocusBoard;
  const submitting = useRef(false);
  const cancelled = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const remarksValue = editing ? remarks : (card.remarks ?? "");

  // Grow with the content instead of jumping to a fixed tall box.
  useLayoutEffect(() => {
    const el = remarksRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [remarksValue]);

  // Closing the tab or backgrounding the app (iOS Capacitor included) mid-edit
  // must not silently lose the draft. localStorage is the reliable fallback —
  // a best-effort network flush is attempted too, but it can be cut off.
  const draftKey = `waddle-focus-draft-v1:${category.id}`;
  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  }
  // Restore a draft left behind by an abrupt close, once per mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      // Older drafts may also carry status fields (`mode`/`text`/`taskId`)
      // from the removed status editor; only the remarks part is restorable.
      const draft = JSON.parse(raw) as { editing?: string; remarks?: unknown };
      if (
        !draft.editing ||
        typeof draft.remarks !== "string" ||
        draft.remarks.trim() === (card.remarks ?? "")
      ) {
        clearDraft();
        return;
      }
      cancelled.current = false;
      setSaveFailed(false);
      setRemarks(draft.remarks);
      setEditing(true);
      setRestored(true);
      toast.info(t("已還原上次未儲存的草稿，請確認後再送出"));
    } catch {
      clearDraft();
    }
    // Restore is a one-time mount check; draftKey is stable per instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist the in-progress draft whenever the page is about to disappear.
  // Refs (not effect deps) hold the latest values so we don't churn the
  // listeners on every keystroke.
  const draftSnapshot = { editing: editing ? "remarks" : null, remarks };
  const draftSnapshotRef = useRef(draftSnapshot);
  draftSnapshotRef.current = draftSnapshot;
  // `save` closes over this render's state; the listeners below are only
  // attached once (stable deps), so without this ref they'd keep calling
  // the mount-time `save` — which still sees `editing === false` — forever.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function persistDraft() {
      const snap = draftSnapshotRef.current;
      if (!snap.editing || cancelled.current || submitting.current) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({ ...snap, ts: Date.now() }));
      } catch {}
      // Best-effort server flush; may not finish before the page is gone,
      // but the localStorage copy above is the guaranteed fallback.
      void saveRef.current();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") persistDraft();
    }
    window.addEventListener("pagehide", persistDraft);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", persistDraft);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  function finishEditing() {
    setRestored(false);
    clearDraft();
    // A flush triggered while the user is still typing (e.g. app briefly
    // backgrounded) must not yank the draft out from under them.
    if (document.activeElement !== remarksRef.current) setEditing(false);
  }
  function cancelEditing() {
    cancelled.current = true;
    setSaveFailed(false);
    setRestored(false);
    setEditing(false);
    clearDraft();
    remarksRef.current?.blur();
  }
  async function save() {
    // Note: `saving` (the board-wide indicator) is intentionally NOT part of
    // this guard. A card whose remarks blur while another card is mid-save
    // must still queue its write via onUpdate (see FocusBoard's serial
    // queue) rather than being silently dropped here.
    if (!editing || cancelled.current || submitting.current) return;
    const next = remarks.trim();
    // After a failed write the board state already holds the optimistic
    // value, so "unchanged" can't be trusted — a retry must always write.
    if (next === (card.remarks ?? "") && !saveFailed) {
      finishEditing();
      return;
    }
    submitting.current = true;
    setSaveFailed(false);
    try {
      await onUpdate({ remarks: next });
      finishEditing();
    } catch {
      setSaveFailed(true);
      toast.error(t("儲存失敗，請重試"));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <article
      data-focus-card={category.id}
      className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-2.5 size-2.5 shrink-0 rounded-full"
          style={{ background: displayColor(workspace.color) }}
        />
        <div className="min-w-0 flex-1">
          <h3
            data-focus-card-title
            className="break-words text-lg font-semibold leading-snug"
          >
            {category.name}
          </h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {workspace.name}
          </p>
        </div>
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t("目前狀態")}
          </p>
          {linked ? (
            <button
              type="button"
              onClick={() => onSelectTask(linked)}
              aria-label={t("開啟原任務") + "：" + linked.title}
              className="min-h-11 w-full min-w-0 max-w-full rounded-md px-1 py-1 text-left text-sm break-words hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Target className="mr-1.5 inline size-4 text-primary" />
              <span className="break-words">{linked.title}</span>
              {linked.isCompleted && (
                <span className="ml-2 text-muted-foreground">
                  {t("已完成")}
                </span>
              )}
            </button>
          ) : (
            <p
              data-focus-status
              className={cn(
                "flex min-h-11 items-center whitespace-pre-wrap break-words px-1 py-1 text-sm",
                !statusText && "text-muted-foreground",
              )}
            >
              {statusText ||
                t(
                  card.status?.mode === "task"
                    ? "原任務已移動或移除，請重新設定狀態"
                    : editable && tasks.length
                      ? "點下方任務旁的 ◎ 設為目前狀態"
                      : "尚未設定狀態",
                )}
            </p>
          )}
          {editable &&
            statusText &&
            !linked &&
            card.status?.mode !== "task" &&
            onAddTask && (
              <button
                disabled={
                  creating || tasks.some((task) => task.title === statusText)
                }
                onClick={async () => {
                  setCreating(true);
                  try {
                    const created: unknown = await onAddTask(
                      category.id,
                      statusText,
                    );
                    if (created === false)
                      toast.error(t("建立任務失敗，請重試"));
                  } catch {
                    toast.error(t("建立任務失敗，請重試"));
                  } finally {
                    setCreating(false);
                  }
                }}
                className="mt-1 min-h-11 rounded-md px-2 text-xs text-primary hover:bg-muted disabled:text-muted-foreground"
              >
                {t(
                  tasks.some((task) => task.title === statusText)
                    ? "已有同名任務"
                    : creating
                      ? "建立中…"
                      : "將此狀態新增為任務",
                )}
              </button>
            )}
        </div>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t("備註")}
          </p>
          {editable ? (
            <>
              <textarea
                ref={remarksRef}
                data-focus-remarks
                aria-label={t("「{name}」備註", { name: category.name })}
                placeholder={t("尚無備註")}
                rows={1}
                maxLength={10000}
                value={remarksValue}
                onFocus={(e) => {
                  if (!editing) {
                    cancelled.current = false;
                    setSaveFailed(false);
                    setRemarks(card.remarks ?? "");
                    setEditing(true);
                  }
                  // iOS: wait for the keyboard to finish sliding up, then keep
                  // the note in view instead of hidden behind it.
                  const el = e.currentTarget;
                  window.setTimeout(() => {
                    if (document.activeElement === el)
                      el.scrollIntoView({ block: "center", behavior: "smooth" });
                  }, 350);
                }}
                onChange={(e) => {
                  if (!editing) setEditing(true);
                  setRemarks(e.target.value);
                }}
                onBlur={() => void save()}
                onKeyDown={(e) => {
                  // Plain Enter is a newline (never a submit), so IME
                  // confirmation can't send anything. ⌘/Ctrl+Enter commits.
                  if (isImeComposing(e)) return;
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!submitting.current) cancelEditing();
                  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="block min-h-11 w-full min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words rounded-md border-0 bg-transparent px-1 py-2.5 text-base leading-6 text-muted-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/60 focus:bg-muted/40 focus:text-foreground focus-visible:outline-none md:py-3 md:text-sm md:leading-5"
              />
              {(saveFailed || restored) && (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="status" className="text-xs text-muted-foreground">
                    {t(saveFailed ? "儲存失敗，請重試" : "已還原上次未儲存的草稿，請確認後再送出")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void save()}
                    className="min-h-11 rounded-lg px-3 text-sm text-primary hover:bg-muted"
                  >
                    {t(saveFailed ? "重試" : "儲存")}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="min-h-11 rounded-lg px-3 text-sm hover:bg-muted"
                  >
                    {t("取消")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {card.remarks || t("尚無備註")}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 border-t border-border pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" aria-label={t(taskView === "collapsed" ? "展開「{name}」任務" : "收起「{name}」任務", { name: category.name })} aria-expanded={taskView !== "collapsed"} onClick={() => onTaskViewChange(taskView === "collapsed" ? "preview" : "collapsed")} className="flex min-h-11 items-center gap-1 rounded-md px-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            {taskView === "collapsed" ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            {t("任務")}{" "}
            <span className="ml-1 text-muted-foreground">
              {done} / {tasks.length} {t("已完成")}
            </span>
          </button>
          {editable && (
            <select
              aria-label={t("「{name}」任務排序", { name: category.name })}
              disabled={saving}
              value={card.taskSort ?? "manual"}
              onChange={(e) =>
                void onUpdate({
                  taskSort: e.target.value as FocusCard["taskSort"],
                }).catch(() => toast.error(t("儲存失敗，請重試")))
              }
              className="min-h-11 max-w-full rounded-md bg-muted/50 px-2 text-base md:text-xs"
            >
              <option value="manual">{t("任務欄順序")}</option>
              <option value="dueDate">{t("依到期日")}</option>
              <option value="urgency">{t("依急迫程度")}</option>
              <option value="created">{t("最新建立")}</option>
            </select>
          )}
        </div>
        {taskView !== "collapsed" && <>
        {editable && (
          <label className="mt-1 flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              disabled={saving}
              checked={!!card.showCompleted}
              onChange={(e) =>
                void onUpdate({ showCompleted: e.target.checked }).catch(() =>
                  toast.error(t("儲存失敗，請重試")),
                )
              }
            />
            {t("顯示已完成任務")}
          </label>
        )}
        <ul className="divide-y divide-border/50">
          {(taskView === "expanded" ? sorted : sorted.slice(0, 4)).map((task) => (
            <li key={task.id} className="flex min-w-0 items-center gap-1">
              <button
                aria-label={t(
                  task.isCompleted
                    ? "將「{name}」標為未完成"
                    : "完成「{name}」",
                  { name: task.title },
                )}
                disabled={!onToggleComplete}
                onClick={() => onToggleComplete?.(task.id)}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {task.isCompleted ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <Circle className="size-4" />
                )}
              </button>
              <button
                onClick={() => onSelectTask(task)}
                className="min-h-11 min-w-0 flex-1 rounded-lg px-1 py-1 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block break-words text-sm",
                    task.isCompleted && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.dueDate && <span className="text-xs text-muted-foreground">{task.dueDate}</span>}
              </button>
              {editable && (
                <button
                  type="button"
                  aria-pressed={linked?.id === task.id}
                  aria-label={t(
                    linked?.id === task.id
                      ? "取消「{name}」目前狀態"
                      : "將「{name}」設為目前狀態",
                    { name: task.title },
                  )}
                  title={t(linked?.id === task.id ? "取消目前狀態" : "設為目前狀態")}
                  disabled={saving}
                  onClick={() =>
                    // The task list is the one place the current status is
                    // chosen; tapping the active ◎ again clears it.
                    void onUpdate({
                      status:
                        linked?.id === task.id
                          ? { mode: "off", updatedAt: new Date().toISOString() }
                          : {
                              mode: "task",
                              taskId: task.id,
                              updatedAt: new Date().toISOString(),
                            },
                    }).catch(() => toast.error(t("儲存失敗，請重試")))
                  }
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    linked?.id === task.id
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <Target className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {sorted.length > 4 && <button type="button" aria-expanded={taskView === "expanded"} onClick={() => onTaskViewChange(taskView === "expanded" ? "preview" : "expanded")} className="min-h-11 w-full rounded-md px-2 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{taskView === "expanded" ? t("只顯示 4 個任務") : t("展開其餘 {count} 個任務", { count: sorted.length - 4 })}</button>}
        {sorted.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {t(tasks.length ? "目前沒有待辦任務" : "這個分類還沒有任務")}
          </p>
        )}
        </>}
      </div>
    </article>
  );
}
