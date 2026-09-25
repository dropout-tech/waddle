export type MeetingResponse = 'pending' | 'accepted' | 'tentative' | 'declined'
export type MeetingStatus = 'active' | 'cancelled'
export interface MeetingParticipant {
  user_id: string
  display_name: string
  response: MeetingResponse
}
export interface MeetingEmailStatus {
  pending: number
  sent: number
  failed: number
}
export interface MeetingInvitation {
  id: string
  organizer_id: string
  title: string
  description: string
  location: string
  starts_at: string
  ends_at: string
  time_zone: string
  status: MeetingStatus
  created_at: string
  participants: MeetingParticipant[]
  email_status: MeetingEmailStatus | null
}
export interface MeetingBusy {
  user_id: string
  starts_at: string
  ends_at: string
}
