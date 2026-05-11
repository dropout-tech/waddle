// Lightweight helpers for the meeting-task visual treatment.
//
// Detection is intentionally pattern-based instead of a strict URL parse:
// users paste shortened links, links with extra query params, and links
// with hash fragments — a lenient substring check covers them all without
// dragging in a URL parser dependency.

export type MeetingProvider = 'zoom' | 'meet' | 'teams' | 'webex' | 'generic'

export function detectMeetingProvider(url?: string | null): MeetingProvider | null {
  if (!url) return null
  const u = url.toLowerCase().trim()
  if (!u) return null
  if (u.includes('zoom.us') || u.includes('zoom.com')) return 'zoom'
  if (u.includes('meet.google.com') || u.includes('hangouts.google.com')) return 'meet'
  if (u.includes('teams.microsoft.com') || u.includes('teams.live.com')) return 'teams'
  if (u.includes('webex.com')) return 'webex'
  // Anything that starts with http(s) and looks like a URL gets the
  // generic "video link" treatment so user-pasted internal-tool links
  // still render the join button.
  if (/^https?:\/\//.test(u)) return 'generic'
  return null
}

export const MEETING_PROVIDER_LABEL: Record<MeetingProvider, string> = {
  zoom: 'Zoom',
  meet: 'Google Meet',
  teams: 'Microsoft Teams',
  webex: 'Webex',
  generic: '視訊連結',
}
