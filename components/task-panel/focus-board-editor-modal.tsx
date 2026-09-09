"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import type { Workspace } from "@/lib/types";
import { defaultCards, type FocusCard, type FocusSettings } from "@/lib/focus";
import { useI18n } from "@/lib/i18n/react";
import { ModalShell } from "@/components/modals/modal-shell";

export function FocusBoardEditorModal({
  isOpen,
  settings,
  workspaces,
  todayStr,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  settings: FocusSettings;
  workspaces: Workspace[];
  todayStr: string;
  onClose: () => void;
  onSave?: (next: FocusSettings) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [cards, setCards] = useState<FocusCard[]>(() => {
    const saved = settings.cards ?? defaultCards(workspaces, todayStr);
    const available = workspaces
      .filter((w) => !w.isArchived)
      .flatMap((w) => w.categories.filter((c) => !c.isArchived));
    return [...saved]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .concat(
        available
          .filter((c) => !saved.some((s) => s.categoryId === c.id))
          .map((c, i) => ({
            categoryId: c.id,
            hidden: true,
            sortOrder: saved.length + i,
          })),
      );
  });
  const [saving, setSaving] = useState(false);
  const available = cards.flatMap((card) => {
    const workspace = workspaces.find(
      (w) =>
        !w.isArchived &&
        w.categories.some((c) => c.id === card.categoryId && !c.isArchived),
    );
    const category = workspace?.categories.find(
      (c) => c.id === card.categoryId,
    );
    return workspace && category ? [{ card, workspace, category }] : [];
  });
  function move(id: string, delta: number) {
    setCards((prev) => {
      const next = [...prev];
      const index = next.findIndex((c) => c.categoryId === id);
      const target =
        available[available.findIndex((e) => e.card.categoryId === id) + delta]
          ?.card.categoryId;
      const to = next.findIndex((c) => c.categoryId === target);
      if (to >= 0) [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      size="lg"
      ariaLabel={t("編輯重點版面")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <h2 className="text-lg font-semibold">{t("編輯重點版面")}</h2>
        <button
          disabled={saving}
          aria-label={t("關閉")}
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {t("勾選要顯示的分類，用上下箭頭排列卡片。隱藏會保留狀態與備註。")}
        </p>
        <ul className="divide-y divide-border">
          {available.map(({ card, workspace, category }, index) => (
            <li key={category.id} className="flex items-center gap-2 py-2">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={!card.hidden}
                  onChange={(e) =>
                    setCards((prev) =>
                      prev.map((c) =>
                        c.categoryId === category.id
                          ? { ...c, hidden: !e.target.checked }
                          : c,
                      ),
                    )
                  }
                />
                <span className="min-w-0 break-words text-sm">
                  {category.name}
                  <span className="block text-xs text-muted-foreground">
                    {workspace.name}
                  </span>
                </span>
              </label>
              <button
                disabled={saving || index === 0}
                aria-label={t("上移「{name}」", { name: category.name })}
                onClick={() => move(category.id, -1)}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                disabled={saving || index === available.length - 1}
                aria-label={t("下移「{name}」", { name: category.name })}
                onClick={() => move(category.id, 1)}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-4">
        <button
          disabled={saving}
          onClick={onClose}
          className="min-h-11 rounded-lg px-4 text-sm hover:bg-muted"
        >
          {t("取消")}
        </button>
        <button
          disabled={saving || !onSave}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave?.({
                ...settings,
                cards: cards.map((c, sortOrder) => ({ ...c, sortOrder })),
              });
              onClose();
            } catch {
              toast.error(t("儲存失敗，請重試"));
            } finally {
              setSaving(false);
            }
          }}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
        >
          {t(saving ? "儲存中…" : "儲存")}
        </button>
      </div>
    </ModalShell>
  );
}
