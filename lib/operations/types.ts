export interface OperationsSettings {
  gifts_enabled: boolean
  trial_enabled: boolean
  trial_days: number
  coupons_enabled: boolean
  referrals_enabled: boolean
  referral_days: number
  friend_days: number
  annual_reward_cap: number
  leaderboard_enabled: boolean
  reminder_enabled: boolean
  reminder_days: number
}
export interface Grant {
  id: string
  days: number
  source: string
  reason: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  revoked_reason?: string
}
export interface Membership {
  member: {
    user_id: string
    alias: string
    referral_code: string | null
    leaderboard_visible: boolean
  }
  admin: boolean
  settings: OperationsSettings
  paid_until: string | null
  pro_until: string | null
  grants: Grant[]
  referral_count: number
  reward_days: number
  referred: boolean
}
export interface Ranking {
  rank: number
  alias: string
  referrals: number
  is_self: boolean
}
export interface Overview {
  members: number
  new_30: number
  dau: number
  wau: number
  mau: number
  paid: number
  gifted: number
  referrals: number
  redemptions: number
  ended_trials: number
  converted_trials: number
  settings: OperationsSettings
}
export interface Member {
  id: string
  email: string
  alias: string | null
  created_at: string
  last_active: string | null
  suspended: boolean
  paid_until: string | null
  gift_until: string | null
  referrals: number
}
export interface Coupon {
  id: string
  code: string
  name: string
  days: number
  audience: string
  target_user_id: string | null
  max_uses: number
  starts_at: string
  expires_at: string
  stackable: boolean
  enabled: boolean
  notes: string
  used: number
  active: number
  paid: number
}
export interface Referral {
  id: string
  referrer: string
  friend: string
  reward_days: number
  grant_id: string | null
  status: string
  created_at: string
}
export interface MemberDetail {
  grants: Grant[]
  referrer: string | null
  referrals: Referral[]
}
export interface Redemption {
  user_id: string
  email: string
  alias: string | null
  created_at: string
}
export interface Billing {
  user_id: string
  email: string
  entitlement: string
  expires_at: string | null
  observed_at_ms: number
}
export interface Audit {
  id: number
  actor_id: string
  action: string
  target: string | null
  detail: Record<string, unknown>
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  kind: 'notice' | 'maintenance'
  starts_at: string
  expires_at: string
  enabled: boolean
}
export interface ChannelMetric {
  channel: string
  registrations: number
  activated: number
  retention_eligible: number
  retained: number
  paid: number
}
