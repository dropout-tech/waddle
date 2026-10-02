#!/usr/bin/env node
/**
 * Pure-function checks for the life grid (lib/life-grid/compute.ts):
 * leap years, month lengths, the local "today", cell states, grid shape,
 * day-of-year, line normalisation. No network, no browser.
 *
 * Run: node scripts/e2e/life-grid-compute-verify.mjs
 */
/* eslint-disable no-console -- CLI test runner: stdout is the evidence */
import assert from 'node:assert/strict'
import {
  buildYearGrid, cellState, countWrittenInYear, dateKey, dayOfYear, daysArrived,
  daysInMonth, daysInYear, isLeapYear, isMood, isWritableDate, normalizeLine,
  parseDateKey, localToday, DAILY_LINE_MAX,
} from '../../lib/life-grid/compute.ts'

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${e.message}`)
  }
}

test('leap years: 2024/2000 yes, 2026/1900/2100 no', () => {
  assert.equal(isLeapYear(2024), true)
  assert.equal(isLeapYear(2000), true)
  assert.equal(isLeapYear(2026), false)
  assert.equal(isLeapYear(1900), false)
  assert.equal(isLeapYear(2100), false)
})

test('February has 29 days in 2024, 28 in 2026', () => {
  assert.equal(daysInMonth(2024, 2), 29)
  assert.equal(daysInMonth(2026, 2), 28)
})

test('30/31-day months', () => {
  assert.deepEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m)), [31, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
})

test('days in year: 365 / 366', () => {
  assert.equal(daysInYear(2026), 365)
  assert.equal(daysInYear(2028), 366)
})

test('grid has 12 rows and exactly 365/366 cells', () => {
  const g26 = buildYearGrid(2026, '2026-10-03')
  assert.equal(g26.length, 12)
  assert.equal(g26.flatMap((m) => m.days).length, 365)
  assert.equal(buildYearGrid(2024, '2026-10-03').flatMap((m) => m.days).length, 366)
  assert.equal(g26[1].days.at(-1).date, '2026-02-28')
})

test('cell states: past / today / future within the current year', () => {
  const days = buildYearGrid(2026, '2026-10-03').flatMap((m) => m.days)
  const by = Object.fromEntries(days.map((d) => [d.date, d.state]))
  assert.equal(by['2026-10-02'], 'past')
  assert.equal(by['2026-10-03'], 'today')
  assert.equal(by['2026-10-04'], 'future')
  assert.equal(days.filter((d) => d.state === 'today').length, 1)
  assert.equal(days.filter((d) => d.state === 'past').length, dayOfYear('2026-10-03') - 1)
})

test('a past year is all past, a future year all future', () => {
  assert.ok(buildYearGrid(2025, '2026-10-03').every((m) => m.days.every((d) => d.state === 'past')))
  assert.ok(buildYearGrid(2027, '2026-10-03').every((m) => m.days.every((d) => d.state === 'future')))
  assert.equal(cellState('2025-12-31', '2026-01-01'), 'past')
})

test('local today: New York 20:00 on 10-03 stays 10-03 (not Taipei\'s 10-04)', () => {
  // 2026-10-03 20:00 EDT = 2026-10-04 00:00Z = 08:00 on 10-04 in Taipei
  const t = new Date('2026-10-04T00:00:00Z')
  assert.equal(localToday(t, 'America/New_York'), '2026-10-03')
  assert.equal(localToday(t, 'Asia/Taipei'), '2026-10-04')
})

test('local today: Taipei 01:00 on 10-04 is already 10-04', () => {
  // 2026-10-04 01:00 +08 = 2026-10-03 17:00Z
  assert.equal(localToday(new Date('2026-10-03T17:00:00Z'), 'Asia/Taipei'), '2026-10-04')
  assert.equal(localToday(new Date('2026-10-03T15:59:59Z'), 'Asia/Taipei'), '2026-10-03')
})

test('local today: default = the device clock (same as calendar-utils toDateString)', () => {
  const now = new Date()
  const expect = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  assert.equal(localToday(now), expect)
  assert.equal(localToday(now), localToday(now, Intl.DateTimeFormat().resolvedOptions().timeZone))
})

test('local today: New Year rollover and leap day', () => {
  assert.equal(localToday(new Date('2026-12-31T16:00:00Z'), 'Asia/Taipei'), '2027-01-01')
  assert.equal(localToday(new Date('2026-12-31T16:00:00Z'), 'America/New_York'), '2026-12-31')
  assert.equal(localToday(new Date('2028-02-28T16:00:00Z'), 'Asia/Taipei'), '2028-02-29')
})

test('day of year incl. leap years', () => {
  assert.equal(dayOfYear('2026-01-01'), 1)
  assert.equal(dayOfYear('2026-12-31'), 365)
  assert.equal(dayOfYear('2024-12-31'), 366)
  assert.equal(dayOfYear('2024-03-01'), 61)
  assert.equal(dayOfYear('2026-03-01'), 60)
})

test('days arrived: past / current / future year', () => {
  assert.equal(daysArrived(2025, '2026-10-03'), 365)
  assert.equal(daysArrived(2026, '2026-10-03'), 276)
  assert.equal(daysArrived(2027, '2026-10-03'), 0)
})

test('strict date parsing rejects impossible dates', () => {
  assert.deepEqual(parseDateKey('2024-02-29'), { year: 2024, month: 2, day: 29 })
  assert.equal(parseDateKey('2025-02-29'), null)
  assert.equal(parseDateKey('2026-04-31'), null)
  assert.equal(parseDateKey('2026-13-01'), null)
  assert.equal(parseDateKey('2026-1-1'), null)
  assert.equal(dateKey(2026, 1, 5), '2026-01-05')
})

test('writable: today and earlier only', () => {
  assert.equal(isWritableDate('2026-10-03', '2026-10-03'), true)
  assert.equal(isWritableDate('2026-01-01', '2026-10-03'), true)
  assert.equal(isWritableDate('2026-10-04', '2026-10-03'), false)
  assert.equal(isWritableDate('2026-02-30', '2026-10-03'), false)
})

test('count written dates inside a year only (dedup, ignores junk)', () => {
  assert.equal(countWrittenInYear(['2026-01-01', '2026-01-01', '2025-12-31', '2026-10-03', 'oops', '2026-02-30'], 2026), 2)
})

test('normalizeLine: one line, trimmed, capped at 140 code points', () => {
  assert.equal(normalizeLine('  今天\n  吃到好吃的   麵 '), '今天 吃到好吃的 麵')
  const long = '🐧'.repeat(200)
  const out = normalizeLine(long)
  assert.equal(Array.from(out).length, DAILY_LINE_MAX)
  assert.ok(out.endsWith('🐧')) // never splits a surrogate pair
})

test('mood guard', () => {
  assert.equal(isMood('great'), true)
  assert.equal(isMood('terrible'), true)
  assert.equal(isMood('happy'), false)
  assert.equal(isMood(null), false)
})

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} cases)`)
process.exit(failed ? 1 : 0)
