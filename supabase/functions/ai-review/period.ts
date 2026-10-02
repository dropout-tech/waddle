// Report periods (design 5). Rolling windows computed on Asia/Taipei wall
// time, line for line the same as components/reports/report-dashboard.tsx
// rangeConfig: "this week" = now minus 7 days, "last week" = the 7 days before
// that, "this month" = now minus one month (setMonth overflow included).
// There is no week start day. Pure: no I/O, no Deno APIs.

export const PERIOD_KEYS = ["this_week", "last_week", "this_month", "last_month"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export interface PeriodWindow {
  key: PeriodKey;
  /** Timestamp window start (inclusive). Also stored as period_start. */
  start: Date;
  /** Timestamp window end. this_*: `now` (stored as period_end, no upper bound
   *  when filtering); last_*: exclusive upper bound. */
  end: Date;
  /** false for this_*: timestamps are filtered with `>= start` only. */
  bounded: boolean;
  /** Date window (YYYY-MM-DD, Taipei) for scheduled dates, board dates, time
   *  blocks and meeting dates. */
  startDate: string;
  endDate: string;
  /** this_*: endDate (= today) is included; last_*: endDate is excluded. */
  endDateInclusive: boolean;
}

const TZ = 8 * 3600_000; // Asia/Taipei, no daylight saving

const wallOf = (now: Date) => new Date(now.getTime() + TZ);
const instant = (wall: Date) => new Date(wall.getTime() - TZ);
const day = (wall: Date) => wall.toISOString().slice(0, 10);

function back(wall: Date, n: number, unit: "day" | "month"): Date {
  const d = new Date(wall);
  if (unit === "day") d.setUTCDate(d.getUTCDate() - n);
  else d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && (PERIOD_KEYS as readonly string[]).includes(v);
}

export function computePeriod(key: PeriodKey, now: Date): PeriodWindow {
  const wall = wallOf(now);
  const unit = key.endsWith("week") ? "day" : "month";
  const step = unit === "day" ? 7 : 1;
  if (key === "this_week" || key === "this_month") {
    const startWall = back(wall, step, unit);
    return {
      key,
      start: instant(startWall),
      end: new Date(now),
      bounded: false,
      startDate: day(startWall),
      endDate: day(wall),
      endDateInclusive: true,
    };
  }
  const startWall = back(wall, step * 2, unit);
  const endWall = back(wall, step, unit);
  return {
    key,
    start: instant(startWall),
    end: instant(endWall),
    bounded: true,
    startDate: day(startWall),
    endDate: day(endWall),
    endDateInclusive: false,
  };
}

/** Timestamp (ISO string) inside the timestamp window. */
export function inTimestampWindow(w: PeriodWindow, iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= w.start.getTime() && (!w.bounded || t < w.end.getTime());
}

/** Date (YYYY-MM-DD) inside the date window. */
export function inDateWindow(w: PeriodWindow, date: string | null | undefined): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= w.startDate && (w.endDateInclusive ? d <= w.endDate : d < w.endDate);
}

/** Taipei wall-clock rendering used in the material: 2026-09-22T16:05+08:00. */
export function taipeiStamp(iso: string | Date): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + TZ).toISOString().slice(0, 16) + "+08:00";
}
