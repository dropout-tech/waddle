'use client'

import { handleExternalAnchorClick } from '@/lib/external-link'
import { Fragment } from 'react'

/**
 * Render task `notes` text into React nodes, turning two link forms into
 * clickable <a> tags:
 *
 *   1. Markdown:  [label](https://example.com)
 *   2. Bare URL:  https://example.com
 *
 * Everything else is preserved as-is including line breaks, bullet points,
 * and checkbox glyphs (☐ / ☑) — callers are expected to wrap output in a
 * container with `whitespace-pre-wrap` so newlines are honored.
 */
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g
const BARE_URL = /https?:\/\/[^\s)]+/g

interface Token {
  type: 'text' | 'link'
  text: string
  href?: string
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0

  // First pass: extract markdown links. Track ranges so the second pass
  // doesn't re-link the URL inside a markdown construct.
  type Range = { start: number; end: number; token: Token }
  const ranges: Range[] = []
  let m: RegExpExecArray | null
  MARKDOWN_LINK.lastIndex = 0
  while ((m = MARKDOWN_LINK.exec(input)) !== null) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { type: 'link', text: m[1], href: m[2] },
    })
  }

  // Second pass within the gaps: bare URLs.
  const pushTextWithBareUrls = (text: string) => {
    let last = 0
    BARE_URL.lastIndex = 0
    let bm: RegExpExecArray | null
    while ((bm = BARE_URL.exec(text)) !== null) {
      if (bm.index > last) {
        tokens.push({ type: 'text', text: text.slice(last, bm.index) })
      }
      tokens.push({ type: 'link', text: bm[0], href: bm[0] })
      last = bm.index + bm[0].length
    }
    if (last < text.length) {
      tokens.push({ type: 'text', text: text.slice(last) })
    }
  }

  for (const r of ranges) {
    if (r.start > cursor) pushTextWithBareUrls(input.slice(cursor, r.start))
    tokens.push(r.token)
    cursor = r.end
  }
  if (cursor < input.length) pushTextWithBareUrls(input.slice(cursor))

  return tokens
}

export function renderNotesWithLinks(notes: string) {
  const tokens = tokenize(notes)
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === 'link' && tok.href) {
          return (
            <a
              key={i}
              href={tok.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation()
                handleExternalAnchorClick(e, tok.href!)
              }}
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary break-all"
            >
              {tok.text}
            </a>
          )
        }
        return <Fragment key={i}>{tok.text}</Fragment>
      })}
    </>
  )
}
