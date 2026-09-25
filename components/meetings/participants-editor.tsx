"use client";
import type { MeetingParticipant, MeetingPeer } from "@/lib/meeting-import";
import { useI18n } from "@/lib/i18n/react";
const input =
  "w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-base";
export function ParticipantsEditor({
  participants,
  peers,
  userId,
  onChange,
  disabled,
}: {
  participants: MeetingParticipant[];
  peers: MeetingPeer[];
  userId: string;
  onChange: (next: MeetingParticipant[]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const update = (id: string, patch: Partial<MeetingParticipant>) =>
    onChange(participants.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{t("與會者與帳號")}</legend>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("填寫姓名、團隊及逐字稿中的別名。只有連結到「我」且有明確原文依據的任務，才會自動加入自己的清單。未連結帳號的人保留為未指派。")}
      </p>
      {participants.map((p, i) => (
        <div
          key={p.id}
          className="grid gap-3 border-b border-border py-4 sm:grid-cols-2"
        >
          <label className="space-y-1 text-sm">
            {t("姓名")}
            <input
              aria-label={t("與會者 {n} 姓名", { n: i + 1 })}
              required
              maxLength={80}
              className={input}
              value={p.name}
              onChange={(e) => update(p.id, { name: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            {t("團隊")}
            <input
              aria-label={t("與會者 {n} 團隊", { n: i + 1 })}
              maxLength={100}
              className={input}
              value={p.organization}
              onChange={(e) => update(p.id, { organization: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            {t("逐字稿別名（逗號分隔）")}
            <input
              aria-label={t("與會者 {n} 別名", { n: i + 1 })}
              className={input}
              value={p.aliases.join("，")}
              onChange={(e) =>
                update(p.id, {
                  aliases: e.target.value.split(/[,，]/).slice(0, 12),
                })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            {t("對應 Huddle 帳號")}
            <select
              aria-label={t("與會者 {n} 帳號", { n: i + 1 })}
              className={input}
              value={p.userId}
              onChange={(e) => update(p.id, { userId: e.target.value })}
            >
              <option value="">{t("未連結帳號")}</option>
              <option value={userId}>{t("我")}</option>
              {peers.map((peer) => (
                <option key={peer.peer_id} value={peer.peer_id}>
                  {peer.display_name || t("共享夥伴")} · {peer.peer_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => onChange(participants.filter((x) => x.id !== p.id))}
            className="min-h-11 justify-self-start text-sm text-muted-foreground hover:text-foreground"
          >
            {t("移除此人")}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={participants.length >= 30}
        className="min-h-11 rounded-lg border border-border px-4 text-sm"
        onClick={() =>
          onChange([
            ...participants,
            {
              id: crypto.randomUUID(),
              name: "",
              organization: "",
              aliases: [],
              userId: "",
            },
          ])
        }
      >
        {t("新增與會者")}
      </button>
    </fieldset>
  );
}
