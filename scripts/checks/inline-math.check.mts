// Deterministic check for lib/inline-math.ts — run: node --experimental-strip-types scripts/checks/inline-math.check.mts
import { solveBeforeEquals as s, completeMathAtCaret } from '../../lib/inline-math.ts'
const cases: [string, string | null][] = [
  ['120*3', '360'], ['(1200+300)*0.8', '1200'], ['500*15%', '75'], ['0.1+0.2', '0.3'],
  ['1,200+300', '1,500'], ['１２０×３', '360'], ['10÷4', '2.5'], ['今天花了 120+80', '200'],
  ['買 3 5+2', '7'], ['-5+3', '-2'], ['2*(3+4', '7'],
  ['3', null], ['2026', null], ['a', null], ['5/0', null], ['3,5+2', '7'], ['', null], ['1+1=2', null],
  ['200+10%', '220'], ['200-10%', '180'], ['1000-20%+5', '805'], ['50%', '0.5'],
]
let fail = 0
for (const [input, want] of cases) {
  const got = s(input)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${input}=" → ${JSON.stringify(got)} (want ${JSON.stringify(want)})`)
}
const t = completeMathAtCaret('a\n12*3=', 7)
const tOk = t?.value === 'a\n12*3=36' && t.caret === 9
if (!tOk) fail++
console.log(`${tOk ? 'PASS' : 'FAIL'}  textarea caret completion → ${JSON.stringify(t)}`)
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
