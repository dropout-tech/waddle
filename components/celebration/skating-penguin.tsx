import { cn } from '@/lib/utils'

interface SkatingPenguinProps {
  className?: string
}

/**
 * "今日全清" celebration variant — Waddle belly-flopped onto the ice,
 * sliding with wings swept back and a trailing foot kicked out, a few
 * hand-drawn speed lines and snow specks streaming behind. Purely
 * decorative, so it's a plain SVG rather than an <img>/role="img".
 *
 * Same drawing language as components/branding/waddle-mascot.tsx — closed
 * paths with a dark charcoal fill/outline for the body (#3a342e /
 * #1f1a14), a cream belly patch (#f5ead0 / #1f1a14), and a near-black
 * pupil (#1a1612) — but this is a one-off pose for the celebration
 * overlay, not part of WaddleMascot's phase system.
 *
 * Drawn facing right (head leads, tail trails) since the celebration
 * slides left → right across the screen.
 */
export function SkatingPenguin({ className }: SkatingPenguinProps) {
  return (
    <svg
      viewBox="-20 0 160 90"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('block', className)}
    >
      {/* Speed lines + snow specks trailing behind the tail */}
      <path d="M-14 22 Q -4 22 4 22" stroke="#1f1a14" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d="M-18 36 Q -6 36 2 36" stroke="#1f1a14" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M-14 50 Q -4 50 4 50" stroke="#1f1a14" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.4" />
      <circle cx="-16" cy="58" r="1.2" fill="#1f1a14" opacity="0.3" />
      <circle cx="-6" cy="62" r="1.6" fill="#1f1a14" opacity="0.35" />
      <circle cx="6" cy="68" r="1.1" fill="#1f1a14" opacity="0.3" />

      {/* Trailing foot, kicked back mid-slide */}
      <ellipse cx="12" cy="52" rx="5.5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" transform="rotate(-15 12 52)" />

      {/* Body — lying flat on the belly, head leading at the right */}
      <path
        d="M14 46
           C10 34 20 20 42 16
           C64 12 88 14 102 24
           C112 31 116 38 114 46
           C112 54 100 60 78 62
           C54 65 28 63 18 55
           C14 52 13 49 14 46 Z"
        fill="#3a342e"
        stroke="#1f1a14"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Cream belly patch, pressed flat against the ice */}
      <path
        d="M24 42
           C24 37 40 34 62 34
           C82 34 96 37 100 44
           C102 50 96 57 80 60
           C58 63 34 61 24 53
           C21 49 22 45 24 42 Z"
        fill="#f5ead0"
        stroke="#1f1a14"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Wing swept back along the body */}
      <path d="M72 18 C56 8 36 10 24 20" stroke="#1f1a14" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Eye */}
      <circle cx="100" cy="27" r="5.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="101.5" cy="27" r="2.2" fill="#1a1612" />

      {/* Beak */}
      <ellipse cx="112" cy="33" rx="3.2" ry="2.2" fill="#1f1a14" transform="rotate(15 112 33)" />
    </svg>
  )
}
