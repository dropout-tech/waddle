'use client'

import { handleExternalAnchorClick } from '@/lib/external-link'
import { Fragment } from 'react'

/**
 * Render task `notes` text into React nodes, turning supported URLs and
 * Markdown into clickable links or uploaded-image previews:
 *
 *   1. Markdown:  [label](https://example.com)
 *   2. Bare URL:  https://example.com
 *   3. Image:     ![alt](https://example.com/image.png)
 *
 * Everything else is preserved as-is including line breaks, bullet points,
 * and checkbox glyphs (☐ / ☑) — callers are expected to wrap output in a
 * container with `whitespace-pre-wrap` so newlines are honored.
 */
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g
const MARKDOWN_IMAGE = /!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g
const BARE_URL = /https?:\/\/[^\s)]+/g

interface Token {
  type: 'text' | 'link' | 'image'
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
  MARKDOWN_IMAGE.lastIndex = 0
  while ((m = MARKDOWN_IMAGE.exec(input)) !== null) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { type: 'image', text: m[1], href: m[2] },
    })
  }

  MARKDOWN_LINK.lastIndex = 0
  while ((m = MARKDOWN_LINK.exec(input)) !== null) {
    // The link-shaped portion inside ![alt](src) is already represented by
    // the image range above; don't emit a duplicate link for it.
    if (ranges.some((range) => m!.index >= range.start && m!.index < range.end)) continue
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { type: 'link', text: m[1], href: m[2] },
    })
  }
  ranges.sort((a, b) => a.start - b.start)

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

interface RenderNotesOptions {
  renderImages?: boolean
}

export function renderNotesWithLinks(notes: string, options: RenderNotesOptions = {}) {
  const tokens = tokenize(notes)
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === 'image' && tok.href) {
          if (!options.renderImages) {
            return (
              <span key={i} className="text-muted-foreground">
                🖼 {tok.text}
              </span>
            )
          }
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={tok.href}
              alt={tok.text}
              loading="lazy"
              className="my-2 max-h-72 max-w-full rounded-lg border border-border bg-secondary/30 object-contain"
            />
          )
        }
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
