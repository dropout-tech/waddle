"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toDateString } from "@/lib/calendar-utils";
import {
  meetingRequest,
  type MeetingImport,
  type MeetingList,
  type MeetingTaskDraft,
} from "@/lib/meeting-import";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const button =
  "min-h-11 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";

export function MeetingWorkspace({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [list, setList] = useState<MeetingList | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(toDateString(new Date()));
  const [transcript, setTranscript] = useState("");
  const [selected, setSelected] = useState<MeetingImport | null>(null);
  const [drafts, setDrafts] = useState<MeetingTaskDraft[]>([]);
  const [checked, setChecked] = useState<number[]>([]);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [observedAt, setObservedAt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const active = useRef(true);
  const actionLock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = category || categories[0]?.id || "";
  const select = useCallback((meeting: MeetingImport) => {
    setSelected(meeting);
    setDrafts(meeting.result?.tasks.map((t) => ({ ...t })) ?? []);
    setChecked(
      meeting.result?.tasks
        .map((_, i) => i)
        .filter((i) => !meeting.imported_tasks[String(i)]) ?? [],
    );
    setNotice("");
    setError("");
  }, []);
  const refresh = useCallback(async () => {
    const next = await meetingRequest<MeetingList>(userId, { action: "list" });
    if (active.current) {
      setList(next);
      setObservedAt(Date.now());
      setLoading(false);
    }
    return next;
  }, [userId]);
  useEffect(() => {
    active.current = true;
    const client = createClient();
    Promise.all([
      client
        .from("workspaces")
        .select("id,name")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("sort_order"),
      client
        .from("categories")
        .select("id,name,workspace_id")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("sort_order"),
    ])
      .then(async ([workspaces, folders]) => {
        const current = await client.auth.getSession();
        if (!active.current || current.data.session?.user.id !== userId) return;
        if (workspaces.error || folders.error) {
          setError("無法讀取任務分類，請重新開啟此頁。");
          return;
        }
        setCategories(
          workspaces.data.flatMap((w) =>
            folders.data
              .filter((c) => c.workspace_id === w.id)
              .map((c) => ({ id: c.id, label: `${w.name} / ${c.name}` })),
          ),
        );
      })
      .catch(() => {
        if (active.current) setError("無法讀取任務分類，請重新開啟此頁。");
      });

    refresh().catch((e) => {
      if (active.current) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      active.current = false;
    };
  }, [refresh, userId]);
  useEffect(() => {
    if (
      !list?.meetings.some(
        (m) =>
          m.status === "pending" &&
          Date.parse(m.created_at) > Date.now() - 300000,
      )
    )
      return;
    const timer = setInterval(() => {
      refresh()
        .then((next) => {
          if (!active.current) return;
          if (selected?.status === "pending") {
            const updated = next.meetings.find((m) => m.id === selected.id);
            if (updated && updated.status !== "pending") select(updated);
          }
        })
        .catch(() => {
          /* explicit refresh remains available */
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [list, refresh, selected, select]);

  async function generate() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      title: title.trim(),
      meetingDate,
      transcript: transcript.trim(),
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const { meeting } = await meetingRequest<{ meeting: MeetingImport }>(
        userId,
        { action: "generate", id: request.current.id, ...payload },
      );
      if (!active.current) return;
      select(meeting);
      if (meeting.status === "failed") {
        request.current = null;
        setError("這次整理未成功，沒有扣除次數。請再試一次。");
      } else if (meeting.status === "pending")
        setNotice("仍在整理中，完成後會自動更新。");
      else {
        setNotice("會議紀錄已儲存。請確認下方任務後再加入。");
        setTitle("");
        setTranscript("");
        request.current = null;
      }
      await refresh();
    } catch (e) {
      if (active.current) {
        setError(e instanceof Error ? e.message : "整理未完成");
        await refresh().catch(() => {});
      }
    } finally {
      actionLock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function importTasks() {
    if (!selected || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { importedTasks } = await meetingRequest<{
        importedTasks: Record<string, string>;
      }>(userId, {
        action: "import",
        id: selected.id,
        categoryId: target,
        tasks: checked.map((index) => ({
          index,
          title: drafts[index].title,
          owner: drafts[index].owner,
          dueDate: drafts[index].dueDate,
        })),
      });
      if (!active.current) return;
      setSelected({ ...selected, imported_tasks: importedTasks });
      setChecked([]);
      setNotice("已加入任務清單，可返回工作面板查看與安排。");
      await refresh();
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "任務未能建立");
    } finally {
      actionLock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(txt|md|srt|vtt)$/i.test(file.name) || file.size > 160000) {
      setError("請選擇 160 KB 以內的 TXT、MD、SRT 或 VTT 文字檔。");
      return;
    }
    const text = await file.text();
    if (!active.current) return;
    if (text.length > 40000 || text.includes("\u0000")) {
      setError("請提供 40,000 字元以內的純文字內容。");
      return;
    }
    setTranscript(text);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 160));
  }
  const available = list ? Math.max(0, 20 - list.used - list.pending) : 0;
  const pending = selected?.status === "pending";
  const expired =
    pending && Date.parse(selected.created_at) <= observedAt - 300000;

  return (
    <main className="h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          返回工作面板
        </Link>
        <header className="mb-8 mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">會議轉任務</h1>
            <p className="mt-3 max-w-prose text-muted-foreground">
              貼上逐字稿或會議筆記，整理重點，留下接下來要做的事。
            </p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {list
              ? `本月已用 ${list.used} / 20 次${list.pending ? ` · ${list.pending} 份處理中` : ""}`
              : loading
                ? "正在讀取額度…"
                : "額度暫時無法讀取"}
            <span className="mt-1 block text-xs">每月 1 日重置 · 台北時間</span>
          </p>
        </header>
        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-muted p-4 text-sm">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-5 rounded-lg bg-secondary p-4 text-sm">
            {notice}
          </p>
        )}
        {list && !list.enabled && (
          <p className="mb-5 text-sm text-muted-foreground">
            AI 整理尚未啟用。已有會議紀錄仍可查看與建立任務。
          </p>
        )}
        {list && available === 0 && (
          <p className="mb-5 text-sm text-muted-foreground">
            {list.used >= 20
              ? "本月 20 次已用完，下個月 1 日（台北時間）會重新開放。已整理的紀錄仍可建立任務。"
              : "剩餘額度正在處理中，完成後會更新。"}
          </p>
        )}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="min-w-0">
            <details open={!selected || selected.status !== "succeeded"}>
              <summary className="mb-5 min-h-11 cursor-pointer py-2 text-sm font-medium">
                {selected ? "整理另一份會議" : "新增會議紀錄"}
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void generate();
                }}
                className="space-y-5"
              >
                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                  <label className="space-y-2 text-sm font-medium">
                    <span>會議名稱</span>
                    <input
                      className={field}
                      value={title}
                      maxLength={160}
                      required
                      disabled={busy}
                      placeholder="例如：網站改版討論"
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>會議日期</span>
                    <input
                      className={field}
                      type="date"
                      required
                      disabled={busy}
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                    />
                  </label>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor="transcript" className="text-sm font-medium">
                      逐字稿／會議筆記
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                      className={`${button} inline-flex items-center gap-2 hover:bg-muted`}
                    >
                      <Upload size={16} />
                      匯入文字檔
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.srt,.vtt"
                    className="hidden"
                    aria-label="選擇逐字稿文字檔"
                    onChange={(e) => {
                      void loadFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <textarea
                    id="transcript"
                    className={`${field} min-h-64 resize-y leading-relaxed`}
                    value={transcript}
                    minLength={20}
                    maxLength={40000}
                    required
                    disabled={busy}
                    placeholder="把會議內容貼在這裡。保留說話者、日期與原句，可以讓任務更清楚。"
                    onChange={(e) => setTranscript(e.target.value)}
                  />
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    {transcript.length.toLocaleString()} / 40,000 字元 · 至少 20
                    字元
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className={`${button} inline-flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90`}
                    disabled={
                      busy ||
                      loading ||
                      !list?.enabled ||
                      available === 0 ||
                      transcript.trim().length < 20 ||
                      !title.trim()
                    }
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                    整理紀錄與任務
                  </button>
                  <p className="text-xs text-muted-foreground">
                    成功整理扣 1 次；確認與建立任務不另扣次。
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  送出後，文字會交由 AI
                  服務整理，並儲存在你的帳號中。本功能不接收錄音檔。
                </p>
              </form>
            </details>
            {selected && (
              <section
                className="mt-10 border-t border-border pt-8"
                aria-label="整理結果"
              >
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.meeting_date} ·{" "}
                  {selected.status === "succeeded"
                    ? "紀錄已儲存"
                    : selected.status === "failed" || expired
                      ? "整理未完成，未扣次"
                      : "正在整理"}
                </p>
                {pending && !expired && (
                  <p role="status" className="mt-5">
                    正在整理重點與任務，請稍候。離開此頁仍可從最近紀錄查看結果。
                  </p>
                )}
                {selected.result && (
                  <>
                    <h3 className="mb-3 mt-6 font-medium">會議摘要</h3>
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {selected.result.summary}
                    </p>
                    {(
                      [
                        ["決議", selected.result.decisions],
                        ["待確認事項", selected.result.questions],
                      ] as const
                    ).map(
                      ([heading, items]) =>
                        items.length > 0 && (
                          <div key={heading}>
                            <h3 className="mb-3 mt-6 font-medium">{heading}</h3>
                            <ul className="list-disc space-y-2 pl-5 leading-relaxed">
                              {items.map((item, i) => (
                                <li className="break-words" key={i}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ),
                    )}
                    <h3 className="mb-2 mt-8 font-medium">
                      確認接下來要做的事
                    </h3>
                    <p className="mb-5 text-sm text-muted-foreground">
                      核對期限與原文後再加入。負責人會存為文字備註，不會自動指派帳號。
                    </p>
                    {drafts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        這份紀錄沒有明確待辦，已保留會議摘要。
                      </p>
                    ) : (
                      <>
                        <label className="mb-5 block space-y-2 text-sm">
                          <span>加入哪個分類</span>
                          <select
                            className={field}
                            value={target}
                            disabled={busy}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!categories.length && (
                          <p className="mb-4 text-sm">
                            請先回工作面板建立可用分類。
                          </p>
                        )}
                        <div className="divide-y divide-border">
                          {drafts.map((task, index) => {
                            const imported =
                              !!selected.imported_tasks[String(index)];
                            const update = (patch: Partial<MeetingTaskDraft>) =>
                              setDrafts((prev) =>
                                prev.map((t, i) =>
                                  i === index ? { ...t, ...patch } : t,
                                ),
                              );
                            return (
                              <div key={index} className="py-5">
                                <div className="flex items-start gap-3">
                                  <label className="flex min-h-11 min-w-11 items-center justify-center">
                                    <input
                                      type="checkbox"
                                      aria-label={`選取任務 ${index + 1}`}
                                      className="h-5 w-5 accent-primary"
                                      disabled={busy || imported}
                                      checked={checked.includes(index)}
                                      onChange={(e) =>
                                        setChecked((prev) =>
                                          e.target.checked
                                            ? [...prev, index]
                                            : prev.filter((i) => i !== index),
                                        )
                                      }
                                    />
                                  </label>
                                  <div className="min-w-0 flex-1 space-y-3">
                                    <label className="block space-y-1 text-sm">
                                      <span>
                                        {imported ? "已加入任務" : "任務名稱"}
                                      </span>
                                      <input
                                        className={field}
                                        value={task.title}
                                        maxLength={200}
                                        disabled={busy || imported}
                                        onChange={(e) =>
                                          update({ title: e.target.value })
                                        }
                                      />
                                    </label>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="space-y-1 text-sm">
                                        <span>負責人（備註）</span>
                                        <input
                                          className={field}
                                          value={task.owner}
                                          maxLength={100}
                                          placeholder="待確認"
                                          disabled={busy || imported}
                                          onChange={(e) =>
                                            update({ owner: e.target.value })
                                          }
                                        />
                                      </label>
                                      <label className="space-y-1 text-sm">
                                        <span>期限</span>
                                        <input
                                          type="date"
                                          className={field}
                                          value={task.dueDate}
                                          disabled={busy || imported}
                                          onChange={(e) =>
                                            update({ dueDate: e.target.value })
                                          }
                                        />
                                      </label>
                                    </div>
                                    <details className="text-sm text-muted-foreground">
                                      <summary className="min-h-11 cursor-pointer py-2">
                                        查看來源原文
                                      </summary>
                                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                                        {task.source}
                                      </p>
                                    </details>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className={`${button} mt-4 bg-primary text-primary-foreground hover:opacity-90`}
                          disabled={
                            busy ||
                            !target ||
                            !checked.length ||
                            checked.some((i) => !drafts[i].title.trim())
                          }
                          onClick={() => void importTasks()}
                        >
                          確認並加入 {checked.length} 個任務
                        </button>
                      </>
                    )}
                  </>
                )}
              </section>
            )}
          </section>
          <aside className="min-w-0 border-t border-border pt-6 lg:border-t-0 lg:pt-0">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">最近紀錄</h2>
              <button
                type="button"
                className={`${button} hover:bg-muted`}
                disabled={busy}
                onClick={() => {
                  setError("");
                  void refresh().catch((e) => setError(e.message));
                }}
              >
                重新整理
              </button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              最近 50 份 · 查看紀錄不扣次
            </p>
            {list?.meetings.length === 0 && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                第一份會議紀錄，從貼上文字開始。
              </p>
            )}
            <ul className="space-y-1">
              {list?.meetings.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => select(m)}
                    className={`${button} w-full text-left ${selected?.id === m.id ? "bg-secondary" : "hover:bg-muted"}`}
                  >
                    <span className="block truncate">{m.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {m.meeting_date} ·{" "}
                      {m.status === "succeeded"
                        ? "已整理"
                        : m.status === "failed" ||
                            Date.parse(m.created_at) <= observedAt - 300000
                          ? "未完成"
                          : "處理中"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
