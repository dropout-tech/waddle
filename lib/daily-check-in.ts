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
}
