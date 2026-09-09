"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toDateString } from "@/lib/calendar-utils";
import { useI18n } from "@/lib/i18n/react";
import { FocusBoard, type FocusBoardProps } from "./focus-board";

export function FocusBoardMobile({
  onClose,
  className,
  ...props
}: Omit<FocusBoardProps, "todayStr"> & {
  onClose: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [today, setToday] = useState(() => toDateString(new Date()));
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(toDateString(new Date())),
      60000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section
      data-testid="focus-board-mobile"
      className={cn(
        "min-h-0 overflow-y-auto bg-background p-4 pb-20",
        className,
      )}
    >
      <button
        onClick={onClose}
        className="mb-3 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted"
      >
        <ArrowLeft className="size-4" />
        {t("返回")}
      </button>
      <FocusBoard {...props} todayStr={today} />
    </section>
  );
}
