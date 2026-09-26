/** One shared reward day, independent of browser locale and device timezone. */
export function checkInDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export interface CheckInStatus {
  check_in_date: string
  checked_in: boolean
  total_points: number
  daily_points: number
}

export interface CheckInRanking {
  rank_position: number | null
  penguin_alias: string
  total_points: number
  is_current_user: boolean
  in_top_50: boolean
  /** Legacy display string ("小企鵝 N"); the UI localizes penguin_number instead. */
  leaderboard_name?: string
  /** Legacy flag from the retired nickname feature. */
  has_nickname?: boolean
  /** Permanent public serial. Absent before migration 20260927100000. */
  penguin_number?: number | null
}

/** Short fallback code, used only before the serial-number migration is live. */
export function leaderboardCode(alias: string): string {
  return alias.slice(0, 4)
}
