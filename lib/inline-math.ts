// Inline calculator for notes: typing "120*3=" appends "360".
// Shared by the Tiptap editors (notebook / whiteboard detail / sticky notes,
// via components/notebook/inline-math.ts) and the whiteboard's plain textarea.
//
// Hand-rolled recursive-descent parser on purpose — never eval(): the input
// is whatever the user typed, and eval would run it as code.
//
// Grammar: expr   = term (("+" | "-") term)*
//          term   = unary (("*" | "/") unary)*
//          unary  = "-" unary | postfix
//          postfix= primary "%"?
//          primary= number | "(" expr ")"

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string }

// Full-width / typographic variants → ASCII, so a Chinese IME's ＋－×÷（）％
// behave the same as a US keyboard.
const NORMALIZE: Record<string, string> = {
  '＋': '+', '－': '-', '−': '-', '＊': '*', '×': '*', '／': '/', '÷': '/',
  '（': '(', '）': ')', '％': '%', '．': '.', '，': ',',
}

// The run of calculator-ish characters immediately before the "=".
const TAIL = /[0-9０-９.．,，+＋\-－−*＊×/／÷()（）%％\s]+$/

function normalize(text: string): string {
  return text
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[＋－−＊×／÷（）％．，]/g, ch => NORMALIZE[ch])
}

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = []
  // Thousands separators only in proper groups ("1,200"), so "3,5" fails
  // instead of silently becoming 35.
  const re = /\s*(?:(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)|([+\-*/()%]))/y
  let index = 0
  while (index < text.length) {
    if (/^\s+$/.test(text.slice(index))) break
    re.lastIndex = index
    const match = re.exec(text)
    if (!match) return null
    if (match[1] !== undefined) tokens.push({ kind: 'num', value: Number(match[1].replace(/,/g, '')) })
    else tokens.push({ kind: 'op', value: match[2] })
    index = re.lastIndex
  }
  return tokens
}

// Percent literal on the right of + / -: "200 + 10%".
// base = 200, op = '+', percent = 10 (the number the user typed before "%").
function addPercent(base: number, op: '+' | '-', percent: number): number {
  // Calculator semantics (user's call, 2026-09-29): "200 + 10%" = 220, i.e.
  // add/subtract that percentage *of the base* — how prices, tax and
  // discounts are usually jotted down. (Excel would give 200.1.)
  return base * (1 + (op === '+' ? percent : -percent) / 100)
}

interface Operand { value: number; percent?: number }

function evaluate(tokens: Token[]): number | null {
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (value: string) => peek()?.kind === 'op' && peek().value === value

  function primary(): Operand {
    const token = tokens[pos++]
    if (!token) throw Error('eof')
    if (token.kind === 'num') return { value: token.value }
    if (token.value === '(') {
      const inner = expr()
      if (!isOp(')')) throw Error('paren')
      pos++
      return { value: inner }
    }
    throw Error('unexpected')
  }
  function postfix(): Operand {
    const operand = primary()
    if (isOp('%')) { pos++; return { value: operand.value / 100, percent: operand.value } }
    return operand
  }
  function unary(): Operand {
    if (isOp('-')) { pos++; const operand = unary(); return { value: -operand.value } }
    if (isOp('+')) { pos++; return unary() }
    return postfix()
  }
  function term(): Operand {
    let left = unary()
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].value
      const right = unary().value
      if (op === '/' && right === 0) throw Error('div0')
      left = { value: op === '*' ? left.value * right : left.value / right }
    }
    return left
  }
  function expr(): number {
    let value = term().value
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].value as '+' | '-'
      const right = term()
      value = right.percent !== undefined
        ? addPercent(value, op, right.percent)
        : op === '+' ? value + right.value : value - right.value
    }
    return value
  }

  try {
    const result = expr()
    return pos === tokens.length ? result : null
  } catch {
    return null
  }
}

function format(value: number, grouped: boolean): string {
  // toPrecision trims float noise: 0.1 + 0.2 → 0.3, not 0.30000000000000004.
  const clean = Number(value.toPrecision(12))
  return clean.toLocaleString('en-US', { useGrouping: grouped, maximumFractionDigits: 10 })
}

/**
 * `before` is the text immediately preceding a just-typed "=" (same line).
 * Returns the result to append after the "=", or null when the tail isn't a
 * calculation (plain "a = b", a lone number, division by zero, …).
 */
export function solveBeforeEquals(before: string): string | null {
  const tail = before.match(TAIL)?.[0]
  if (!tail) return null
  const text = normalize(tail)
  // Longest suffix that parses wins: "買 3 5+2" → "5+2", "今天 12*3" → "12*3".
  for (let start = 0; start < text.length; start++) {
    if (start > 0 && !/[\s,(]/.test(text[start - 1])) continue
    const candidate = text.slice(start).trim()
    // Needs an actual operation — "2026" or "3" alone never triggers.
    if (!/\d/.test(candidate) || !/[+\-*/%]/.test(candidate.replace(/^[+-]/, ''))) continue
    const tokens = tokenize(candidate)
    if (!tokens?.length) continue
    const value = evaluate(tokens)
    if (value === null || !Number.isFinite(value)) continue
    return format(value, /\d,\d{3}/.test(candidate))
  }
  return null
}

/**
 * Plain-textarea variant: if the character just before `caret` is "=" / "＝"
 * and the text before it is a calculation, returns the new value and caret.
 */
export function completeMathAtCaret(value: string, caret: number): { value: string; caret: number } | null {
  const eq = value[caret - 1]
  if (eq !== '=' && eq !== '＝') return null
  const lineStart = value.lastIndexOf('\n', caret - 2) + 1
  const result = solveBeforeEquals(value.slice(lineStart, caret - 1))
  if (result === null) return null
  return { value: value.slice(0, caret) + result + value.slice(caret), caret: caret + result.length }
}
