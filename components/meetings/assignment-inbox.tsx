"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { meetingRequest, type MeetingAssignment } from "@/lib/meeting-import";
import { useI18n } from "@/lib/i18n/react";

export function AssignmentInbox() {
  const { user } = useAuth();
  return user ? <Inbox key={user.id} userId={user.id} /> : null;
}
function Inbox({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<MeetingAssignment[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true),
    lock = useRef(false);
  const target = category || categories[0]?.id || "";
  const refresh = useCallback(async () => {
    const data = await meetingRequest<{ assignments: MeetingAssignment[] }>(
      userId,
      { action: "inbox" },
    );
    if (active.current) setItems(data.assignments);
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
      .then(async ([ws, cs]) => {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (!active.current || session?.user.id !== userId) return;
        if (ws.error || cs.error) {
          setError(t("無法讀取分類，請重新開啟總覽。"));
          return;
        }
        setCategories(
          ws.data.flatMap((w) =>
            cs.data
              .filter((c) => c.workspace_id === w.id)
              .map((c) => ({ id: c.id, label: `${w.name} / ${c.name}` })),
          ),
        );
      })
      .catch(() => {
        if (active.current) setError(t("無法讀取分類，請重新開啟總覽。"));
      });
    const load = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {
          if (active.current) setError(t("暫時無法讀取指派，請稍後重新整理。"));
        });
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [userId, refresh]);
  async function respond(item: MeetingAssignment, accept: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { assignment } = await meetingRequest<{
        assignment: MeetingAssignment;
      }>(userId, {
        action: "respond",
        id: item.id,
        accept,
        categoryId: accept ? target : "",
      });
      if (!active.current) return;
      setItems((prev) => prev.map((a) => (a.id === item.id ? assignment : a)));
      setNotice(
        t(
          assignment.status === "accepted"
            ? "已接受並加入你的任務清單。"
            : "已拒絕，不會建立任務。",
        ),
      );
      // Existing board loader refetches on focus. This is a narrow data refresh,
      // not a page reload that could discard unrelated work.
      window.dispatchEvent(new Event("huddle:tasks-imported"));
    } catch (e) {
      if (active.current)
        setError(t(e instanceof Error ? e.message : "未能處理指派"));
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  const pending = items.filter((a) => a.status === "pending");
  return (
    <section
      aria-label={t("待接受指派")}
      className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">
          {t("待接受指派")}
          {pending.length > 0 ? t(" · {count}", { count: pending.length }) : ""}
        </h2>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-lg px-3 text-sm hover:bg-muted"
          onClick={() => {
            setError("");
            void refresh().catch(() =>
              setError(t("暫時無法讀取指派，請稍後重試。")),
            );
          }}
        >
          {t("重新整理指派")}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("先看清楚誰指派、要做什麼，再決定是否接下。")}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
      {pending.length === 0 && !error && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("目前沒有等待你確認的任務。")}
        </p>
      )}
      {pending.length > 0 && (
        <label className="mt-4 block text-sm">
          {t("接受後加入分類")}
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3"
            value={target}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option value={c.id} key={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!target && pending.length > 0 && (
        <p className="mt-2 text-sm">
          {t("請先建立自己的任務分類再接受，仍可拒絕指派。")}
        </p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {pending.map((item) => (
          <li key={item.id} className="py-4">
            <p className="text-sm text-muted-foreground">
              {t("{name} 指派給你", { name: item.sender_name })}
            </p>
            <h3 className="mt-1 break-words font-medium">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.meeting_title} · {item.meeting_date}
              {item.due_date
                ? t(" · 期限 {date}", { date: item.due_date })
                : t(" · 期限待確認")}
            </p>
            <details className="mt-2 text-sm">
              <summary className="min-h-11 cursor-pointer py-2">
                {t("查看任務原文")}
              </summary>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {item.source}
              </p>
            </details>
            <div className="mt-3 flex gap-3">
              <button
                className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
                disabled={busy || !target}
                onClick={() => void respond(item, true)}
              >
                {t("接受並加入任務")}
              </button>
              <button
                className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => void respond(item, false)}
              >
                {t("拒絕")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.some((a) => a.status !== "pending") && (
        <details className="mt-4 text-sm">
          <summary className="min-h-11 cursor-pointer py-2">
            {t("已回覆的指派")}
          </summary>
          <ul className="space-y-2">
            {items
              .filter((a) => a.status !== "pending")
              .map((a) => (
                <li key={a.id}>
                  {a.sender_name} · {a.title} ·{" "}
                  {a.status === "accepted" ? t("已接受") : t("已拒絕")}
                </li>
              ))}
          </ul>
        </details>
      )}
      <Link
        href="/meetings"
        className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        {t("開啟會議轉任務")}
      </Link>
    </section>
  );
}
