"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ParticipantsEditor } from "./participants-editor";
import type { MeetingParticipant, MeetingPeer } from "@/lib/meeting-import";
import { ArrowLeft, FileText, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toDateString } from "@/lib/calendar-utils";
import {
  meetingRequest,
  type MeetingImport,
  type MeetingList,
  type MeetingTaskDraft,
} from "@/lib/meeting-import";
import { useI18n } from "@/lib/i18n/react";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const button =
  "min-h-11 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";

export function MeetingWorkspace({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [categories, setCategories] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [peers, setPeers] = useState<MeetingPeer[]>([]);
  const [meetingTime, setMeetingTime] = useState("");
  const [autoSelf, setAutoSelf] = useState(true);
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
    setDrafts(
      meeting.result?.tasks.map((t, index) => ({
        ...t,
        assigneeId:
          meeting.imported_tasks[String(index)] ? userId : t.assignmentConfidence === "explicit"
            ? meeting.context?.participants.find(
                (p) => p.id === t.ownerParticipantId,
              )?.userId || ""
            : "",
        ...meeting.checklist?.[String(index)],
      })) ?? [],
    );
    setChecked(
      meeting.result?.tasks
        .map((_, i) => i)
        .filter(
          (i) =>
            !meeting.imported_tasks[String(i)] &&
            !meeting.assignments?.some((a) => a.source_index === i),
        ) ?? [],
    );
    setNotice("");
    setError("");
  }, [userId]);
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
    meetingRequest<{ peers: MeetingPeer[] }>(userId, { action: "directory" })
      .then((data) => {
        if (active.current) setPeers(data.peers);
      })
      .catch(() => {
        if (active.current)
          setError(t("暫時無法讀取共享夥伴，仍可使用未指派 checklist。"));
      });
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
          setError(t("無法讀取任務分類，請重新開啟此頁。"));
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
        if (active.current) setError(t("無法讀取任務分類，請重新開啟此頁。"));
      });

    refresh().catch((e) => {
      if (active.current) {
        setError(t(e.message));
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
      context: {
        meetingTime,
        participants: participants.map((p) => ({
          ...p,
          name: p.name.trim(),
          organization: p.organization.trim(),
          aliases: p.aliases.map((a) => a.trim()).filter(Boolean),
        })),
        categoryId: target,
        autoSelf: autoSelf && !!target,
      },
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
        setError(t("這次整理未成功，沒有扣除次數。請再試一次。"));
      } else if (meeting.status === "pending")
        setNotice(t("仍在整理中，完成後會自動更新。"));
      else {
        setNotice(t("會議紀錄已儲存。請確認下方任務後再加入。"));
        setTitle("");
        setTranscript("");
        request.current = null;
      }
      await refresh();
    } catch (e) {
      if (active.current) {
        setError(t(e instanceof Error ? e.message : "整理未完成"));
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
      const { importedTasks, checklist } = await meetingRequest<{
        importedTasks: Record<string, string>;
        checklist: Record<string, MeetingTaskDraft>;
      }>(userId, {
        action: "import",
        id: selected.id,
        categoryId: target,
        tasks: checked.map((index) => ({
          index,
          title: drafts[index].title,
          owner: drafts[index].owner,
          dueDate: drafts[index].dueDate,
          assigneeId: drafts[index].assigneeId || "",
        })),
      });
      if (!active.current) return;
      setSelected({ ...selected, imported_tasks: importedTasks, checklist });
      setChecked([]);
      setNotice(
        t(
          "已儲存 checklist：指派給自己的直接加入，其他人的指派等待對方接受。",
        ),
      );
      const latest = await refresh();
      if (active.current) {
        const updated = latest.meetings.find((m) => m.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (e) {
      if (active.current)
        setError(t(e instanceof Error ? e.message : "任務未能建立"));
    } finally {
      actionLock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(txt|md|srt|vtt)$/i.test(file.name) || file.size > 160000) {
      setError(t("請選擇 160 KB 以內的 TXT、MD、SRT 或 VTT 文字檔。"));
      return;
    }
    const text = await file.text();
    if (!active.current) return;
    if (text.length > 40000 || text.includes("\u0000")) {
      setError(t("請提供 40,000 字元以內的純文字內容。"));
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
          {t("返回工作面板")}
        </Link>
        <header className="mb-8 mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{t("會議轉任務")}</h1>
            <p className="mt-3 max-w-prose text-muted-foreground">
              {t("貼上逐字稿或會議筆記，整理重點，留下接下來要做的事。")}
            </p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {list
              ? t("本月已用 {used} / 20 次", { used: list.used }) +
                (list.pending
                  ? t(" · {pending} 份處理中", { pending: list.pending })
                  : "")
              : loading
                ? t("正在讀取額度…")
                : t("額度暫時無法讀取")}
            <span className="mt-1 block text-xs">{t("每月 1 日重置 · 台北時間")}</span>
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
            {t("AI 整理尚未啟用。已有會議紀錄仍可查看與建立任務。")}
          </p>
        )}
        {list && available === 0 && (
          <p className="mb-5 text-sm text-muted-foreground">
            {list.used >= 20
              ? t(
                  "本月 20 次已用完，下個月 1 日（台北時間）會重新開放。已整理的紀錄仍可建立任務。",
                )
              : t("剩餘額度正在處理中，完成後會更新。")}
          </p>
        )}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="min-w-0">
            <details open={!selected || selected.status !== "succeeded"}>
              <summary className="mb-5 min-h-11 cursor-pointer py-2 text-sm font-medium">
                {selected ? t("整理另一份會議") : t("新增會議紀錄")}
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
                    <span>{t("會議名稱")}</span>
                    <input
                      className={field}
                      value={title}
                      maxLength={160}
                      required
                      disabled={busy}
                      placeholder={t("例如：網站改版討論")}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>{t("會議日期")}</span>
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
                <label className="block space-y-2 text-sm">
                  {t("會議時間（台北時間，可留空）")}
                  <input
                    type="time"
                    className={field}
                    value={meetingTime}
                    disabled={busy}
                    onChange={(e) => setMeetingTime(e.target.value)}
                  />
                </label>
                <ParticipantsEditor
                  participants={participants}
                  peers={peers}
                  userId={userId}
                  onChange={setParticipants}
                  disabled={busy}
                />
                <label className="block space-y-2 text-sm">
                  {t("自己的任務加入哪個分類")}
                  <select
                    className={field}
                    value={target}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={busy}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={autoSelf}
                    disabled={busy || !target}
                    onChange={(e) => setAutoSelf(e.target.checked)}
                  />
                  {t("有明確依據、指派給「我」的任務，整理完成後直接建立")}
                </label>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor="transcript" className="text-sm font-medium">
                      {t("逐字稿／會議筆記")}
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                      className={`${button} inline-flex items-center gap-2 hover:bg-muted`}
                    >
                      <Upload size={16} />
                      {t("匯入文字檔")}
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.srt,.vtt"
                    className="hidden"
                    aria-label={t("選擇逐字稿文字檔")}
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
                    placeholder={t(
                      "把會議內容貼在這裡。保留說話者、日期與原句，可以讓任務更清楚。",
                    )}
                    onChange={(e) => setTranscript(e.target.value)}
                  />
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    {t("{count} / 40,000 字元 · 至少 20 字元", {
                      count: transcript.length.toLocaleString(),
                    })}
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
                    {t("整理紀錄與任務")}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {t("成功整理扣 1 次；確認與建立任務不另扣次。")}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "送出後，文字會交由 AI 服務整理，並儲存在你的帳號中。本功能不接收錄音檔。",
                  )}
                </p>
              </form>
            </details>
            {selected && (
              <section
                className="mt-10 border-t border-border pt-8"
                aria-label={t("整理結果")}
              >
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.meeting_date} ·{" "}
                  {t(
                    selected.status === "succeeded"
                      ? "紀錄已儲存"
                      : selected.status === "failed" || expired
                        ? "整理未完成，未扣次"
                        : "正在整理",
                  )}
                </p>
                {selected.context && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {selected.context.meetingTime ? t('時間：{time}（台北） · ', { time: selected.context.meetingTime }) : ''}
                  {t('與會者：{list}', { list: selected.context.participants.map(p=>`${p.name}${p.organization ? `（${p.organization}）` : ''}`).join('、') || t('未提供') })}
                </p>}
                {pending && !expired && (
                  <p role="status" className="mt-5">
                    {t("正在整理重點與任務，請稍候。離開此頁仍可從最近紀錄查看結果。")}
                  </p>
                )}
                {selected.result && (
                  <>
                    <h3 className="mb-3 mt-6 font-medium">{t("會議摘要")}</h3>
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {selected.result.summary}
                    </p>
                    {(
                      [
                        [t("決議"), selected.result.decisions],
                        [t("待確認事項"), selected.result.questions],
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
                      {t("確認接下來要做的事")}
                    </h3>
                    <p className="mb-5 text-sm text-muted-foreground">
                      {t("核對原文後，選擇指派給自己、共享夥伴或不指派。對方接受前，不會加入對方的任務清單。")}
                    </p>
                    {drafts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("這份紀錄沒有明確待辦，已保留會議摘要。")}
                      </p>
                    ) : (
                      <>
                        <label className="mb-5 block space-y-2 text-sm">
                          <span>{t("加入哪個分類")}</span>
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
                            {t("請先回工作面板建立可用分類。")}
                          </p>
                        )}
                        <div className="divide-y divide-border">
                          {drafts.map((task, index) => {
                            const assignment = selected.assignments?.find(
                              (a) => a.source_index === index,
                            );
                            const imported =
                              !!selected.imported_tasks[String(index)] ||
                              !!assignment;
                            const statusLabel = assignment
                              ? t(
                                  {
                                    pending: "已送出，等待接受",
                                    accepted: "對方已接受",
                                    rejected: "對方已拒絕",
                                  }[assignment.status],
                                )
                              : t("已加入自己的任務");
                            const update = (patch: Partial<MeetingTaskDraft>) =>
                              setDrafts((prev) =>
                                prev.map((draft, i) =>
                                  i === index ? { ...draft, ...patch } : draft,
                                ),
                              );
                            return (
                              <div key={index} className="py-5">
                                <div className="flex items-start gap-3">
                                  <label className="flex min-h-11 min-w-11 items-center justify-center">
                                    <input
                                      type="checkbox"
                                      aria-label={t("選取任務 {n}", { n: index + 1 })}
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
                                        {imported ? statusLabel : t("任務名稱")}
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
                                        <span>{t("指派給")}</span>
                                        <select
                                          aria-label={t("任務 {n} 指派給", { n: index + 1 })}
                                          className={field}
                                          value={task.assigneeId || ""}
                                          disabled={busy || imported}
                                          onChange={(e) =>
                                            update({
                                              assigneeId: e.target.value,
                                            })
                                          }
                                        >
                                          <option value="">
                                            {t("不指派，保留 checklist")}
                                          </option>
                                          <option value={userId}>{t("我")}</option>
                                          {peers.map((peer) => (
                                            <option
                                              key={peer.peer_id}
                                              value={peer.peer_id}
                                            >
                                              {peer.display_name || t("共享夥伴")}{" "}
                                              · {peer.peer_id.slice(0, 8)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="space-y-1 text-sm">
                                        <span>{t("期限")}</span>
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
                                    <p className="text-xs text-muted-foreground">
                                      {task.owner
                                        ? t("原文提及：{owner}。", { owner: task.owner })
                                        : ""}
                                      {task.assignmentReason ||
                                        t("負責人待確認，請自行選擇。")}
                                    </p>
                                    <details className="text-sm text-muted-foreground">
                                      <summary className="min-h-11 cursor-pointer py-2">
                                        {t("查看來源原文")}
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
                            (checked.some(
                              (i) => drafts[i].assigneeId === userId,
                            ) &&
                              !target) ||
                            !checked.length ||
                            checked.some((i) => !drafts[i].title.trim())
                          }
                          onClick={() => void importTasks()}
                        >
                          {t("儲存並處理 {count} 個待辦", { count: checked.length })}
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
              <h2 className="font-medium">{t("最近紀錄")}</h2>
              <button
                type="button"
                className={`${button} hover:bg-muted`}
                disabled={busy}
                onClick={() => {
                  setError("");
                  void refresh().catch((e) => setError(t(e.message)));
                }}
              >
                {t("重新整理")}
              </button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              {t("最近 50 份 · 查看紀錄不扣次")}
            </p>
            {list?.meetings.length === 0 && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("第一份會議紀錄，從貼上文字開始。")}
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
                      {t(
                        m.status === "succeeded"
                          ? "已整理"
                          : m.status === "failed" ||
                              Date.parse(m.created_at) <= observedAt - 300000
                            ? "未完成"
                            : "處理中",
                      )}
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
