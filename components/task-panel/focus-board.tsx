"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  LayoutGrid,
  List,
  Pencil,
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
  const cards = focus.cards ?? defaultCards(workspaces, todayStr);
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
  async function update(categoryId: string, patch: Partial<FocusCard>) {
    if (!onSetFocusBoard || saving) return;
    setSaving(true);
    try {
      await onSetFocusBoard({
        ...focus,
        cards: cards.map((c) =>
          c.categoryId === categoryId ? { ...c, ...patch } : c,
        ),
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div data-testid="focus-board" className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-semibold">{t("當前重點")}</h2>
        <input
          aria-label={t("搜尋分類或任務")}
          placeholder={t("搜尋分類或任務")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
          "grid items-start gap-5",
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
}: FocusBoardProps & {
  card: FocusCard;
  workspace: Workspace;
  category: Workspace["categories"][number];
  saving: boolean;
  onUpdate: (patch: Partial<FocusCard>) => Promise<void>;
}) {
  const { t } = useI18n();
  const displayColor = useDisplayColor();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [remarks, setRemarks] = useState("");
  const [mode, setMode] = useState<"text" | "task">("text");
  const [taskId, setTaskId] = useState("");
  const [creating, setCreating] = useState(false);
  const tasks = category.tasks.filter(
    (task) => !task.isArchived && task.showInTaskList !== false,
  );
  // Never resolve a reference outside this category, even after a task is moved.
  const linked =
    card.status?.mode === "task"
      ? tasks.find((task) => task.id === card.status?.taskId)
      : undefined;
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
  const field =
    "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  function edit() {
    setMode(card.status?.mode === "task" ? "task" : "text");
    setTaskId(linked?.id ?? "");
    setText(
      card.status?.mode === "text"
        ? (card.status.text ?? "")
        : (card.note ?? ""),
    );
    setRemarks(card.remarks ?? "");
    setEditing(true);
  }
  return (
    <article
      data-focus-card={category.id}
      className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-2.5 size-2.5 shrink-0 rounded-full"
          style={{ background: displayColor(workspace.color) }}
        />
        <div className="min-w-0 flex-1">
          <h3
            data-focus-card-title
            className="break-words text-2xl font-semibold leading-snug"
          >
            {category.name}
          </h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {workspace.name}
          </p>
        </div>
        {editable && (
          <button
            aria-label={t("編輯「{name}」狀態與備註", { name: category.name })}
            disabled={saving}
            onClick={edit}
            className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="mt-5 space-y-3"
          onKeyDown={(e) => {
            if (e.key === "Enter" && isImeComposing(e)) e.preventDefault();
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await onUpdate({
                status:
                  mode === "task"
                    ? {
                        mode: "task",
                        taskId,
                        updatedAt: new Date().toISOString(),
                      }
                    : {
                        mode: "text",
                        text: text.trim(),
                        updatedAt: new Date().toISOString(),
                      },
                remarks: remarks.trim(),
              });
              setEditing(false);
            } catch {
              toast.error(t("儲存失敗，請重試"));
            }
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>{t("目前狀態")}</span>
            <select
              className={field}
              value={mode}
              onChange={(e) => setMode(e.target.value as "text" | "task")}
            >
              <option value="text">{t("自訂文字")}</option>
              <option value="task">{t("引用任務")}</option>
            </select>
          </label>
          {mode === "text" ? (
            <>
              <input
                aria-label={t("自訂狀態")}
                className={field}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                {t("只儲存狀態文字，不會自動建立任務。")}
              </p>
            </>
          ) : (
            <select
              aria-label={t("選擇狀態任務")}
              required
              className={field}
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">{t("選擇任務")}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.isCompleted ? `${t("已完成")} · ` : ""}
                  {task.title}
                </option>
              ))}
            </select>
          )}
          <label className="block space-y-1 text-sm">
            <span>{t("備註")}</span>
            <textarea
              className={field}
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              maxLength={10000}
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={saving || (mode === "task" && !taskId)}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
            >
              {t(saving ? "儲存中…" : "儲存")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="min-h-11 rounded-lg px-4 text-sm hover:bg-muted"
            >
              {t("取消")}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t("目前狀態")}
            </p>
            {linked ? (
              <button
                onClick={() => onSelectTask(linked)}
                className="min-h-11 w-full min-w-0 max-w-full break-words text-left text-base font-medium leading-relaxed hover:underline"
              >
                <Target className="mr-1.5 inline size-4" />
                <span className="break-words">{linked.title}</span>
                {linked.isCompleted && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t("已完成")}
                  </span>
                )}
              </button>
            ) : (
              <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                {statusText ||
                  t(
                    card.status?.mode === "task"
                      ? "原任務已移動或移除，請重新設定狀態"
                      : "尚未設定狀態",
                  )}
              </p>
            )}
            {editable &&
              statusText &&
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
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t("備註")}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {card.remarks || t("尚無備註")}
            </p>
          </div>
        </div>
      )}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            {t("任務")}{" "}
            <span className="ml-1 text-muted-foreground">
              {done} / {tasks.length} {t("已完成")}
            </span>
          </p>
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
        <ul className="mt-2 divide-y divide-border/50">
          {sorted.map((task) => (
            <li key={task.id} className="flex min-w-0 items-center gap-1 py-1">
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
                className="min-h-11 min-w-0 flex-1 rounded-lg px-1 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block break-words text-sm",
                    task.isCompleted && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t(task.isCompleted ? "已完成" : "待辦")}
                  {task.dueDate ? ` · ${task.dueDate}` : ""}
                </span>
              </button>
              {editable && (
                <button
                  aria-label={t("將「{name}」設為目前狀態", {
                    name: task.title,
                  })}
                  title={t("設為目前狀態")}
                  disabled={saving}
                  onClick={() =>
                    void onUpdate({
                      status: {
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
        {sorted.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {t(tasks.length ? "目前沒有待辦任務" : "這個分類還沒有任務")}
          </p>
        )}
      </div>
    </article>
  );
}
