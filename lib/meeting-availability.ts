import type { Task, TimeBlock } from './types'
import {
  parseDateString,
  taskOccursOnDate,
  toDateString,
} from './calendar-utils'

export type CommonSlot = { start: string; end: string }
export type BusyInterval = { starts_at: string; ends_at: string }
export interface AvailabilityOptions {
  tasks: Task[]
  peerEvents: Task[]
  from: string
  to: string
  startHour: number
  endHour: number
  durationMinutes: number
  busy?: BusyInterval[]
  timeBlocks?: TimeBlock[]
  now?: Date
}
function dateKey(value: string) {
  const date = parseDateString(value)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(+date) ||
    toDateString(date) !== value
  )
    throw new Error('invalid_date')
  return date
}
function minutes(value: string) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error('invalid_busy_time')
  const [h, m, s = 0] = value.split(':').map(Number)
  if (h > 23 || m > 59 || s > 59) throw new Error('invalid_busy_time')
  return h * 60 + m + s / 60
}
function atMinute(day: Date, minute: number) {
  const d = new Date(day)
  d.setHours(0, Math.floor(minute), Math.round((minute % 1) * 60), 0)
  return d
}
/** Calendar task dates are local wall-clock dates, matching the existing calendar.
 * Meeting timestamps are absolute instants. Never treat a failed fetch as []. */
export function findCommonSlots(options: AvailabilityOptions): CommonSlot[] {
  const {
    tasks,
    peerEvents,
    from,
    to,
    startHour,
    endHour,
    durationMinutes,
    busy = [],
    timeBlocks = [],
    now = new Date(),
  } = options
  const first = dateKey(from),
    last = dateKey(to)
  const days = Math.round((+last - +first) / 86400000) + 1
  if (
    days < 1 ||
    days > 14 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 240 ||
    !Number.isFinite(startHour) ||
    !Number.isFinite(endHour) ||
    startHour < 0 ||
    endHour > 24 ||
    endHour <= startHour ||
    !Number.isFinite(+now)
  )
    throw new Error('invalid_range')
  const intervals: [number, number][] = busy.map((item) => {
    const a = Date.parse(item.starts_at),
      b = Date.parse(item.ends_at)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a)
      throw new Error('invalid_busy_interval')
    return [a, b]
  })
  // Include yesterday so overnight events also block the first search day.
  const previous = new Date(first)
  previous.setDate(previous.getDate() - 1)
  for (
    const day = new Date(previous);
    day <= last;
    day.setDate(day.getDate() + 1)
  ) {
    for (const task of [...tasks, ...peerEvents]) {
      if (task.isArchived || !taskOccursOnDate(task, day)) continue
      if (!task.scheduledStartTime && !task.scheduledEndTime) continue // Unscheduled task, not a busy block.
      if (!task.scheduledStartTime || !task.scheduledEndTime)
        throw new Error('incomplete_busy_time')
      const a = minutes(task.scheduledStartTime),
        b = minutes(task.scheduledEndTime)
      intervals.push([+atMinute(day, a), +atMinute(day, b <= a ? b + 1440 : b)])
    }
    for (const block of timeBlocks) {
      if (block.isRecurring && block.recurrenceRule)
        throw new Error('unsupported_time_block_recurrence')
      if (block.date !== toDateString(day)) continue
      const a = minutes(block.startTime),
        b = minutes(block.endTime)
      intervals.push([+atMinute(day, a), +atMinute(day, b <= a ? b + 1440 : b)])
    }
  }
  intervals.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const interval of intervals) {
    const previous = merged.at(-1)
    if (previous && interval[0] <= previous[1])
      previous[1] = Math.max(previous[1], interval[1])
    else merged.push([...interval])
  }
  const result: CommonSlot[] = []
  for (
    const day = new Date(first);
    day <= last;
    day.setDate(day.getDate() + 1)
  ) {
    for (
      let minute = Math.ceil((startHour * 60) / 15) * 15;
      minute + durationMinutes <= endHour * 60;
      minute += 15
    ) {
      const start = atMinute(day, minute),
        end = atMinute(day, minute + durationMinutes)
      // Skip nonexistent/ambiguous-duration DST slots, rather than silently shifting the invite.
      if (
        start.getHours() * 60 + start.getMinutes() !== minute ||
        +end - +start !== durationMinutes * 60000 ||
        +start <= +now
      )
        continue
      if (!merged.some(([a, b]) => +start < b && +end > a))
        result.push({ start: start.toISOString(), end: end.toISOString() })
    }
  }
  return result
}

function escapeICS(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}
function stamp(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(+date)) throw new Error('invalid_date')
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}
/** RFC 5545 UTF-8 folding (75 octets), CRLF and escaping avoid injected properties. */
function fold(value: string) {
  const lines: string[] = []
  let line = ''
  let bytes = 0
  for (const char of value) {
    const size = new TextEncoder().encode(char).length
    if (bytes + size > 75) {
      lines.push(line)
      line = ' '
      bytes = 1
    }
    line += char
    bytes += size
  }
  lines.push(line)
  return lines.join('\r\n')
}
export function buildMeetingICS(meeting: {
  id: string
  title: string
  description?: string
  location?: string
  starts_at: string
  ends_at: string
  status?: string
  created_at?: string
}) {
  if (
    !/^[a-zA-Z0-9-]+$/.test(meeting.id) ||
    Date.parse(meeting.ends_at) <= Date.parse(meeting.starts_at)
  )
    throw new Error('invalid_meeting')
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Huddle//Meetings//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${meeting.id}@huddle`,
      `DTSTAMP:${stamp(meeting.created_at || new Date().toISOString())}`,
      `DTSTART:${stamp(meeting.starts_at)}`,
      `DTEND:${stamp(meeting.ends_at)}`,
      `SUMMARY:${escapeICS(meeting.title)}`,
      `DESCRIPTION:${escapeICS(meeting.description || '')}`,
      `LOCATION:${escapeICS(meeting.location || '')}`,
      `STATUS:${meeting.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  )
}
