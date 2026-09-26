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
  /** Opted-in nickname, or the server's anonymous code. Absent before the nickname migration. */
  leaderboard_name?: string
  has_nickname?: boolean
}

export const LEADERBOARD_NICKNAME_MAX = 16

/** Mirrors the database trim (ASCII + full-width whitespace at both ends). */
export function normalizeLeaderboardNickname(value: string): string {
  return value.trim()
}

/** Short anonymous code shown when a member has not chosen a nickname. */
export function leaderboardCode(alias: string): string {
  return alias.slice(0, 4)
}
