/* eslint-disable no-console -- executable scheduling and ICS regression */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

if (!process.argv.includes('--child')) {
 for (const zone of ['Asia/Taipei', 'America/New_York']) {
  const run = spawnSync(process.execPath, [process.argv[1], '--child'], { env: { ...process.env, TZ: zone }, encoding: 'utf8' })
  process.stdout.write(run.stdout); process.stderr.write(run.stderr)
  assert.equal(run.status, 0, `${zone} availability regression`)
 }
 process.exit(0)
}
const directory = mkdtempSync(join(tmpdir(), 'huddle-availability-'))
let checks = 0
const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS', label) }
try {
 for (const name of ['calendar-utils', 'meeting-availability']) {
  const source = readFileSync(`lib/${name}.ts`, 'utf8').replace("from './calendar-utils'", "from './calendar-utils.mjs'")
  writeFileSync(join(directory, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText)
 }
 const { findCommonSlots: find, buildMeetingICS: ics } = await import(pathToFileURL(join(directory, 'meeting-availability.mjs')))
 const date = '2026-09-21'
 const at = (hour, day = date) => new Date(`${day}T${hour}:00`).toISOString()
 const task = (start, end, extra = {}) => ({ scheduledDate: date, scheduledStartTime: start, scheduledEndTime: end, ...extra })
 const options = { tasks: [], peerEvents: [], from: date, to: date, startHour: 9, endHour: 12, durationMinutes: 30, now: new Date('2026-01-01T00:00:00Z') }
 const contains = (slots, time, day = date) => slots.some(slot => slot.start === at(time, day))
 check('Empty calendars enumerate 15-minute starts', find(options).length === 11)
 let slots = find({ ...options, tasks: [task('09:00', '10:00')], peerEvents: [task('10:30', '11:00'), task('11:30', '12:00')] })
 check('Own calendar and multiple peers intersect to common availability', slots.length === 2 && contains(slots, '10:00') && contains(slots, '11:00'))
 check('Exactly adjacent busy intervals leave the boundary available', contains(find({ ...options, peerEvents: [task('09:00', '10:00')] }), '10:00'))
 check('Second precision busy ends do not expose a partially occupied slot', !contains(find({ ...options, peerEvents: [task('09:00:00', '10:00:59')] }), '10:00'))
 check('Overlap shorter than meeting duration still blocks candidate', !contains(find({ ...options, peerEvents: [task('09:29', '09:31')] }), '09:00'))
 check('Previous-day overnight task blocks first search day', !contains(find({ ...options, tasks: [task('23:00', '09:30', { scheduledDate: '2026-09-20' })] }), '09:00'))
 check('Previous-day overnight time block also blocks', !contains(find({ ...options, timeBlocks: [{ date: '2026-09-20', startTime: '23:00', endTime: '09:30' }] }), '09:00'))
 const recurring = task('09:00', '10:00', { scheduledDate: '2026-09-20', isRecurring: true, recurrence: { type: 'daily', interval: 1 } })
 check('Recurring tasks block subsequent dates', !contains(find({ ...options, tasks: [recurring] }), '09:00'))
 check('Recurrence exclusion removes the occurrence', contains(find({ ...options, tasks: [{ ...recurring, exdates: [date] }] }), '09:00'))
 check('Archived tasks do not block availability', contains(find({ ...options, tasks: [task('09:00', '10:00', { isArchived: true })] }), '09:00'))
 check('Absolute UTC meeting intervals block matching local time', !contains(find({ ...options, busy: [{ starts_at: at('09:00'), ends_at: at('10:00') }] }), '09:00'))
 check('Past and exact-now slots are excluded', !contains(find({ ...options, now: new Date(at('09:00')) }), '09:00'))
 check('A fourteen-day range is supported', find({ ...options, to: '2026-10-04' }).length === 154)
 for (const [label, patch, error] of [
  ['Fifteen-day ranges fail', { to: '2026-10-05' }, /invalid_range/],
  ['Reversed ranges fail', { to: '2026-09-20' }, /invalid_range/],
  ['Impossible dates fail', { from: '2026-02-30' }, /invalid_date/],
  ['Missing event end fails closed', { peerEvents: [task('09:00', undefined)] }, /incomplete_busy_time/],
  ['Invalid event hours fail closed', { peerEvents: [task('25:00', '26:00')] }, /invalid_busy_time/],
  ['Invalid event seconds fail closed', { peerEvents: [task('09:00:99', '10:00:00')] }, /invalid_busy_time/],
  ['Invalid absolute busy interval fails closed', { busy: [{ starts_at: 'invalid', ends_at: at('10:00') }] }, /invalid_busy_interval/],
  ['Reversed absolute busy interval fails closed', { busy: [{ starts_at: at('10:00'), ends_at: at('09:00') }] }, /invalid_busy_interval/],
 ]) { assert.throws(() => find({ ...options, ...patch }), error, label); check(label, true) }
 const meeting = { id: 'meeting-123', title: 'Planning', starts_at: '2026-09-21T09:00:00+08:00', ends_at: '2026-09-21T10:00:00+08:00', created_at: '2026-09-01T00:00:00Z' }
 let output = ics(meeting)
 check('ICS uses UTC times and CRLF', output.includes('DTSTART:20260921T010000Z\r\n') && output.includes('DTEND:20260921T020000Z\r\n') && !/(?<!\r)\n/.test(output))
 output = ics({ ...meeting, title: 'Name\r\nATTENDEE:evil@example.invalid', description: 'Comma, semicolon; slash\\ newline\nend', location: 'Room\rSTATUS:CANCELLED' })
 check('CRLF injection cannot create calendar properties', !output.includes('\r\nATTENDEE:') && !output.includes('\r\nSTATUS:CANCELLED') && output.includes('Name\\nATTENDEE:'))
 check('ICS text escapes separators, backslashes and newline', output.includes('Comma\\, semicolon\\; slash\\\\ newline\\nend'))
 const longTitle = '會議🌿與創作'.repeat(35)
 output = ics({ ...meeting, title: longTitle })
 check('UTF-8 folding keeps every physical line within 75 octets', output.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
 check('Folding preserves Unicode after unfolding', output.replace(/\r\n /g, '').includes(`SUMMARY:${longTitle}\r\n`))
 check('Cancelled meeting has cancellation status', ics({ ...meeting, status: 'cancelled' }).includes('STATUS:CANCELLED\r\n'))
 assert.throws(() => ics({ ...meeting, id: 'bad\r\nUID:evil' }), /invalid_meeting/)
 assert.throws(() => ics({ ...meeting, ends_at: meeting.starts_at }), /invalid_meeting/)
 assert.throws(() => ics({ ...meeting, starts_at: 'invalid' }), /invalid_date/)
 check('Invalid ICS IDs, nonpositive durations and dates are rejected', true)
 if (process.env.TZ === 'America/New_York') {
  slots = find({ ...options, from: '2026-03-08', to: '2026-03-08', startHour: 1, endHour: 4, durationMinutes: 30 })
  check('Spring DST skips nonexistent local times', slots.every(slot => new Date(slot.start).getHours() !== 2))
  check('Spring DST preserves actual meeting duration', slots.every(slot => Date.parse(slot.end) - Date.parse(slot.start) === 1800000))
  slots = find({ ...options, from: '2026-11-01', to: '2026-11-01', startHour: 0, endHour: 4, durationMinutes: 60 })
  check('Autumn DST excludes slots stretched by repeated hour', slots.every(slot => Date.parse(slot.end) - Date.parse(slot.start) === 3600000))
 }
 console.log(`Meeting availability verification: ${checks} checks passed (${process.env.TZ}).`)
} finally { rmSync(directory, { recursive: true, force: true }) }
