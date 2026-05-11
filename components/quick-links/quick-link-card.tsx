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
  const fallbackIcon = link.title.trim().slice(0, 1) || '🔗'
  const display = link.icon?.trim() || fallbackIcon
  const accent = link.color
  // White-on-light is invisible; pick text tone based on accent luminance.
  const accentTextDark = accent ? isLightColor(accent) : true

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => openLink(link.url)}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 w-20 h-20 rounded-xl border bg-card transition-all',
          'hover:shadow-md hover:-translate-y-0.5 hover:border-foreground/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={
          accent
            ? {
                borderColor: `${accent}80`,
                backgroundColor: `${accent}1a`,
              }
            : undefined
        }
        title={link.url}
      >
        <span
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold',
            accent ? '' : 'bg-muted text-foreground',
          )}
          style={
            accent
              ? {
                  backgroundColor: accent,
                  color: accentTextDark ? '#1f1f1f' : '#fff',
                }
              : undefined
          }
        >
          {display}
        </span>
        <span className="text-[11px] font-medium text-foreground/85 truncate max-w-[68px]">
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
            // Edit affordance: visible on hover (desktop) and always
            // visible on touch (where hover is unreliable).
            'absolute -top-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full',
            'bg-card border border-border shadow-sm text-muted-foreground',
            'opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100',
            // On touch devices, force visible — relies on hover:none media query.
            'touch:opacity-100',
            'transition-opacity hover:text-foreground hover:bg-muted',
          )}
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
