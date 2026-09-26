'use client'

import { openExternalUrl } from '@/lib/external-link'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { detectMeetingProvider } from '@/lib/meeting-utils'
import type { QuickLink } from '@/lib/types'
import { useI18n } from '@/lib/i18n/react'

interface QuickLinkCardProps {
  link: QuickLink
  onEdit?: (link: QuickLink) => void
}

/** Open URL only if it's a real http(s) scheme — same guard used for
 *  meeting URLs. Blocks `javascript:` / `data:` / `file:` even though
 *  the modal already validates on save, because the data could have
 *  been written directly to the DB by another path. */
function openLink(url: string) {
  const provider = detectMeetingProvider(url)
  if (provider === null && !/^https?:\/\//i.test(url)) {
    console.warn('[quick-link] refused to open non-http(s) URL', url)
    return
  }
  void openExternalUrl(url)
}

/**
 * One tile on the 常用連結 grid.
 *
 * Visual language follows the app's paper theme (DESIGN.md, app/art-theme.css):
 * a plain paper card with a thin ink hairline — no gradients. The user's
 * chosen color survives only on the icon square, flattened and mixed toward
 * the warm muted paper tone so saturated brand colors (FB blue, Gmail pink)
 * sit quietly in the cream palette instead of shouting. Because the mix is
 * against theme tokens, the same tile works in dark mode.
 */
export function QuickLinkCard({ link, onEdit }: QuickLinkCardProps) {
  const { t } = useI18n()
  // Fallback icon: first **grapheme** (full character) of the title so
  // CJK glyphs render cleanly instead of half a codepoint. `Array.from`
  // splits by code unit, good enough for the languages Waddle ships in.
  const fallbackIcon = Array.from(link.title.trim())[0] ?? '🔗'
  const display = link.icon?.trim() || fallbackIcon
  const accent = link.color

  return (
    <div className="relative group aspect-square" data-quick-link-card>
      <button
        type="button"
        onClick={() => openLink(link.url)}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 w-full h-full',
          'rounded-2xl border border-border bg-card overflow-hidden',
          'shadow-[0_1px_0_rgba(41,43,36,0.06)]',
          'transition-[transform,border-color,box-shadow] duration-200 ease-out',
          'hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_3px_0_rgba(41,43,36,0.08)]',
          'active:scale-[0.97] active:translate-y-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
        title={`${link.title}\n${link.url}`}
      >
        {/* Icon square — flat fill. With a user color: that color blended (sRGB, so
            the hue stays true) ~1/3 into the muted paper tone plus a hairline in the color
            itself, so the hue still identifies the link. Without: muted. */}
        <span
          data-quick-link-icon
          className={cn(
            'flex items-center justify-center w-11 h-11 rounded-xl text-foreground',
            'transition-transform duration-200 group-hover:scale-105',
            accent ? '' : 'bg-muted border border-border',
          )}
          style={
            accent
              ? {
                  backgroundColor: `color-mix(in srgb, ${accent} 34%, var(--muted))`,
                  border: `1px solid color-mix(in srgb, ${accent} 50%, var(--border))`,
                }
              : undefined
          }
        >
          <span className="text-base font-semibold leading-none">
            {display}
          </span>
        </span>

        {/* Title. Two-line clamp so longer names don't truncate too
            aggressively. */}
        <span
          className={cn(
            'px-2 text-center text-[11px] leading-tight tracking-tight font-medium',
            'text-foreground/85 line-clamp-2',
          )}
        >
          {link.title}
        </span>
      </button>

      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(link)
          }}
          aria-label={t('編輯 {title}', { title: link.title })}
          data-quick-link-edit
          className={cn(
            // The <button> is only the hit area: transparent, pinned to the
            // card's top-right corner. The visible disc is the small inner
            // span tucked into the corner so it never covers the icon
            // (iPhone report 2026-09-26: the old visible 44px disc sat on
            // top of 「雲端」「FB訊息」…). Touch keeps a 44x44 target.
            'group/edit absolute top-0 right-0 flex items-start justify-end p-1 w-7 h-7 rounded-tr-2xl',
            '[@media(hover:none)]:w-11 [@media(hover:none)]:h-11',
            // Hover-revealed on desktop, always shown on touch.
            'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity',
            'focus-visible:opacity-100 focus-visible:outline-none',
          )}
        >
          <span
            aria-hidden="true"
            data-quick-link-edit-disc
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded-full',
              'bg-card border border-border text-muted-foreground',
              'transition-colors group-hover/edit:text-foreground group-hover/edit:bg-muted',
              'group-focus-visible/edit:ring-2 group-focus-visible/edit:ring-ring',
            )}
          >
            <Pencil className="w-2.5 h-2.5" />
          </span>
        </button>
      )}
    </div>
  )
}
