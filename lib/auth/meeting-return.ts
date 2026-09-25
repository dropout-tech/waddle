/** Carry an invitation through login without accepting an arbitrary redirect URL. */
export const PENDING_MEETING_INVITE_KEY = 'huddle-pending-meeting-invite'
export function pendingMeetingPath(): string | null {
  try {
    const id = window.sessionStorage.getItem(PENDING_MEETING_INVITE_KEY)
    return id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ? `/meetings/invitations?invite=${id}`
      : null
  } catch {
    return null
  }
}
