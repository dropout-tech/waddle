'use client'

import { Pencil } from 'lucide-react'
import { cn, isLightColor } from '@/lib/utils'
import { detectMeetingProvider } from '@/lib/meeting-utils'
import type { QuickLink } from '@/lib/types'

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
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function QuickLinkCard({ link, onEdit }: QuickLinkCardProps) {
  // Fallback icon: first **grapheme** (full character) of the title so
  // CJK glyphs render cleanly instead of half a codepoint. `Array.from`
  // splits by code unit, good enough for the languages Waddle ships in.
  const fallbackIcon = Array.from(link.title.trim())[0] ?? '🔗'
  const display = link.icon?.trim() || fallbackIcon
  const accent = link.color
  const accentTextDark = accent ? isLightColor(accent) : true

  return (
    <div className="relative group aspect-square">
      <button
        type="button"
        onClick={() => openLink(link.url)}
        className={cn(
          // Outer card. Slightly larger corner radius + soft shadow for
          // depth. Subtle border that nearly disappears against the
          // accent wash — the color does the visual heavy lifting.
          'relative flex flex-col items-center justify-center gap-2 w-full h-full',
          'rounded-2xl border border-border/50 bg-card overflow-hidden',
          // Smooth lift on hover. Shadow follows the accent color when
          // present so the hover state feels "owned" by the card.
          'transition-all duration-200 ease-out',
          'hover:-translate-y-1 hover:border-foreground/20',
          'active:scale-[0.97] active:translate-y-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
        style={
          accent
            ? {
                // Gentle gradient from accent at top to white at bottom.
                // Layered radial-gradient adds a slight highlight at the
                // top-center, mimicking soft top-down lighting.
                backgroundImage: `
                  radial-gradient(circle at 50% 0%, ${accent}40 0%, transparent 60%),
                  linear-gradient(180deg, ${accent}1a 0%, transparent 100%)
                `,
              }
            : undefined
        }
        title={`${link.title}\n${link.url}`}
      >
        {/* Icon disc — slightly oversized + subtle outer ring + inset
            highlight. Reads as a glossy app-icon when a color is set,
            falls back to a muted disc otherwise. */}
        <span
          className={cn(
            'flex items-center justify-center w-11 h-11 rounded-xl',
            'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.25)]',
            'transition-transform duration-200 group-hover:scale-105',
            accent ? '' : 'bg-muted/80 text-foreground/80',
          )}
          style={
            accent
              ? {
                  backgroundImage: `linear-gradient(140deg, ${accent} 0%, ${accent}d0 100%)`,
                  color: accentTextDark ? 'rgba(31,31,31,0.92)' : '#fff',
                }
              : undefined
          }
        >
          {/* Icon text. Larger so emojis read clearly; tighter line
              height so multi-character strings still center cleanly. */}
          <span className="text-base font-semibold leading-none">
            {display}
          </span>
        </span>

        {/* Title. Two-line clamp so longer names don't truncate too
            aggressively. Letter-spacing nudged tight for that
            "app-grid label" feel. */}
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
          aria-label={`編輯 ${link.title}`}
          className={cn(
            'absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full',
            // Touch devices get a >=44x44 hit box (visual disc stays w-6
            // h-6 so it doesn't dominate the small card) — pointer is
            // coarse there so there's no risk of stealing precise mouse
            // clicks meant for the card underneath.
            '[@media(hover:none)]:w-11 [@media(hover:none)]:h-11',
            'bg-card/95 backdrop-blur-sm border border-border shadow-sm text-muted-foreground',
            // Hover-revealed on desktop, semi-visible on touch where
            // hover is unreliable.
            'opacity-0 group-hover:opacity-100',
            'transition-opacity hover:text-foreground hover:bg-muted',
            // Force visible on coarse pointers (touch).
            '[@media(hover:none)]:opacity-80',
          )}
        >
          <Pencil className="w-3 h-3 [@media(hover:none)]:w-3.5 [@media(hover:none)]:h-3.5" />
        </button>
      )}
    </div>
  )
}
