'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useDayPhase, type DayPhase } from '@/hooks/use-day-phase'
import { useI18n } from '@/lib/i18n/react'

type WaddlePhase = DayPhase | 'auto'

interface WaddleMascotProps {
  className?: string
  /** Render the warm-yellow rounded background behind Huddle. */
  withBackground?: boolean
  /** Hides the mascot from screen readers when used decoratively next to text. */
  decorative?: boolean
  /** Keeps the quiet late-night zzz detail without changing the mascot artwork. */
  phase?: WaddlePhase
}

/**
 * The single shared Huddle mascot surface.
 *
 * All legacy callers keep their existing sizing, motion, accessibility, and
 * optional icon background, but the artwork always comes from the approved
 * `/huddle-mascot.png` asset. Keeping this as the only shared entry point
 * prevents loading, auth, report, onboarding, invite, and export surfaces
 * from drifting back to an older hand-drawn variant.
 */
export function WaddleMascot({
  className,
  withBackground = false,
  decorative = true,
  phase = 'work',
}: WaddleMascotProps) {
  const autoPhase = useDayPhase()
  const resolved: DayPhase = phase === 'auto' ? autoPhase : phase
  const { t } = useI18n()

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : t('Huddle 企鵝吉祥物')}
      className={cn(
        'relative inline-block aspect-square shrink-0 overflow-visible',
        withBackground && 'bg-[#f4d977]',
        className,
      )}
    >
      <Image
        src="/huddle-mascot.png"
        alt=""
        width={512}
        height={512}
        loading="eager"
        aria-hidden="true"
        draggable={false}
        className={cn(
          'block object-contain',
          withBackground ? 'absolute inset-[5%] h-[90%] w-[90%]' : 'h-full w-full',
        )}
      />

      {resolved === 'night' && (
        <span aria-hidden="true" className="pointer-events-none absolute -right-[4%] -top-[8%] text-foreground/55">
          <span
            className="absolute right-0 top-0 text-[0.28em] font-bold leading-none"
            style={{ animation: 'huddle-zzz-far 2.8s ease-in-out infinite 0.35s' }}
          >z</span>
          <span
            className="absolute right-[0.32em] top-[0.34em] text-[0.38em] font-bold leading-none"
            style={{ animation: 'huddle-zzz-near 2.8s ease-in-out infinite' }}
          >z</span>
        </span>
      )}

      <style>{`
        @keyframes huddle-zzz-near {
          0%, 100% { transform: translate(0, 0); opacity: 0.45; }
          50% { transform: translate(-1px, -3px); opacity: 0.75; }
        }
        @keyframes huddle-zzz-far {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(1px, -4px); opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="huddle-zzz"] { animation: none !important; }
        }
      `}</style>
    </span>
  )
}
