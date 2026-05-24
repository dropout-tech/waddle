'use client'

import { cn } from '@/lib/utils'
import { useDayPhase, type DayPhase } from '@/hooks/use-day-phase'

/**
 * Mascot mood. Pass a specific phase for control, `'auto'` to follow the
 * user's local time-of-day, or omit entirely (defaults to `'work'`) to keep
 * the original brand-stable look — used for logos, exports, and one-off
 * appearances where a sleeping penguin would be off-tone.
 */
type WaddlePhase = DayPhase | 'auto'

interface WaddleMascotProps {
  className?: string
  /** Render the warm-yellow rounded background behind the penguin (app-icon look). */
  withBackground?: boolean
  /** Hides the mascot from screen readers when used decoratively next to text. */
  decorative?: boolean
  /**
   * Mascot expression. Default `'work'` preserves the original alert look for
   * existing callers (logos, onboarding, PNG export, etc). Pass `'auto'` on
   * persistently-visible surfaces (e.g. the panel header) to let the penguin
   * subtly match the user's day phase — yawning in the morning, dozing late
   * at night. The differences are intentionally small so they read as a
   * quiet daily delight rather than a feature announcement.
   */
  phase?: WaddlePhase
}

export function WaddleMascot({
  className,
  withBackground = false,
  decorative = true,
  phase = 'work',
}: WaddleMascotProps) {
  // Resolve `auto` against the local-time hook. Calling the hook
  // unconditionally keeps the hook rules happy; when phase is a fixed
  // value, the hook result is just ignored.
  const autoPhase = useDayPhase()
  const resolved: DayPhase = phase === 'auto' ? autoPhase : phase

  // Eye and beak geometry varies by phase. The body / belly / feet are
  // intentionally constant — silhouette stays the same so the mascot still
  // reads as "the same penguin" at a glance.
  const eyes = renderEyes(resolved)
  const beak = renderBeak(resolved)

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Waddle 企鵝吉祥物'}
      className={cn('block', className)}
    >
      <defs>
        <style>{`
          @keyframes waddle-zzz-near {
            0%, 100% { transform: translate(0, 0); opacity: 0.45; }
            50% { transform: translate(-1px, -3px); opacity: 0.75; }
          }
          @keyframes waddle-zzz-far {
            0%, 100% { transform: translate(0, 0); opacity: 0.3; }
            50% { transform: translate(1px, -4px); opacity: 0.6; }
          }
          @media (prefers-reduced-motion: reduce) {
            .waddle-zzz { animation: none !important; }
          }
        `}</style>
      </defs>

      {withBackground && (
        <rect x="0" y="0" width="100" height="100" rx="22" fill="#f4d977" />
      )}

      {/* Body + two tufts on top, drawn as one closed shape */}
      <path
        d="M30 16
           C28.5 9 24.5 7 22 9
           C20 11 20.5 14.5 25 19
           C19 24 15 33 15 48
           C15 71 28 88 50 88
           C72 88 85 71 85 48
           C85 33 81 24 75 19
           C79.5 14.5 80 11 78 9
           C75.5 7 71.5 9 70 16
           C64 13 57 12 50 12
           C43 12 36 13 30 16Z"
        fill="#3a342e"
        stroke="#1f1a14"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Cream belly patch — slightly irregular, fluffy bottom edge */}
      <path
        d="M37 48
           C37 45 41 44 50 44
           C59 44 63 45 63 48
           C66 60 65 76 60 84
           C56 87 52 88 50 88
           C48 88 44 87 40 84
           C35 76 34 60 37 48Z"
        fill="#f5ead0"
        stroke="#1f1a14"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {eyes}
      {beak}

      {/* Feet — two little ovals peeking out at the bottom */}
      <ellipse cx="42" cy="89" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
      <ellipse cx="58" cy="89" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />

      {/* Night phase: two floating "z"s above the head. Sized big enough
          to survive small-icon rendering (~36px in the panel header) —
          font-size 12 in a 100-unit viewBox is ~4.3px on screen at that
          size, which is just-readable when combined with the slow
          translate animation. Positioned between/above the body's top
          tufts so they read as floating above the penguin's head. */}
      {resolved === 'night' && (
        <g>
          <text
            className="waddle-zzz"
            x="55" y="12"
            fontSize="12"
            fontWeight="700"
            fill="#1f1a14"
            style={{ animation: 'waddle-zzz-near 2.8s ease-in-out infinite', transformOrigin: '55px 12px' }}
          >z</text>
          <text
            className="waddle-zzz"
            x="66" y="5"
            fontSize="9"
            fontWeight="700"
            fill="#1f1a14"
            style={{ animation: 'waddle-zzz-far 2.8s ease-in-out infinite 0.4s', transformOrigin: '66px 5px' }}
          >z</text>
        </g>
      )}
    </svg>
  )
}

/**
 * Eye variants. Body proportions and eye-white anchor positions stay the
 * same across all phases so the silhouette is recognizable; only the inner
 * shapes (pupil position/size, or closed-eye arcs) shift.
 */
function renderEyes(phase: DayPhase) {
  switch (phase) {
    case 'morning':
      // Sleepy / just-waking: eye whites compressed to flat ellipses (ry 4)
      // with very small pupils nudged down. The flatter eyes are the main
      // tell — sub-pixel pupil shifts won't survive anti-aliasing at small
      // sizes, but a ~50% height squash on the eye-white is unmistakable.
      return (
        <>
          <ellipse cx="38" cy="44" rx="8" ry="4" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
          <ellipse cx="62" cy="44" rx="8" ry="4" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
          <circle cx="38" cy="45.5" r="2.2" fill="#1a1612" />
          <circle cx="62" cy="45.5" r="2.2" fill="#1a1612" />
        </>
      )
    case 'evening':
      // Winding down: pupils shifted upward by 2 viewBox-units (cy 40
      // vs default 42) so the gaze tilts gently toward a soft "looking
      // out at the horizon" pose without crossing into wide-eyed
      // surprise. The first draft pushed pupils to cy=38, which read as
      // alarmed at the icon's typical 36px render size — a smaller
      // shift with the original pupil radius keeps the silhouette
      // calm rather than concerned.
      return (
        <>
          <circle cx="38" cy="42" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
          <circle cx="62" cy="42" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
          <circle cx="38" cy="40" r="3.3" fill="#1a1612" />
          <circle cx="62" cy="40" r="3.3" fill="#1a1612" />
        </>
      )
    case 'night':
      // Closed eyes — gentle downward curves. Heavier stroke (3.5) so the
      // closed lids carry the same visual weight at small sizes as the
      // outlined eye whites in the other phases.
      return (
        <>
          <path
            d="M 30 42 Q 38 47 46 42"
            stroke="#1f1a14" strokeWidth="3.5" strokeLinecap="round" fill="none"
          />
          <path
            d="M 54 42 Q 62 47 70 42"
            stroke="#1f1a14" strokeWidth="3.5" strokeLinecap="round" fill="none"
          />
        </>
      )
    case 'work':
    default:
      // Default alert eyes (the original look).
      return (
        <>
          <circle cx="38" cy="42" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
          <circle cx="62" cy="42" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
          <circle cx="38" cy="42" r="3.5" fill="#1a1612" />
          <circle cx="62" cy="42" r="3.5" fill="#1a1612" />
        </>
      )
  }
}

function renderBeak(phase: DayPhase) {
  // Morning: distinctly taller and slightly narrower beak with a small
  // open-mouth highlight, reads as a yawn. The shape delta is large
  // enough to survive 36px rendering — a 0.8-unit delta in the first
  // draft was sub-pixel and invisible.
  if (phase === 'morning') {
    return (
      <>
        <ellipse cx="50" cy="52" rx="2.2" ry="4.5" fill="#1f1a14" />
        {/* Small dark "open mouth" cavity inside the beak so the yawn
            reads as a hollow rather than just a longer dot. */}
        <ellipse cx="50" cy="53" rx="0.9" ry="2.4" fill="#0a0807" />
      </>
    )
  }
  return <ellipse cx="50" cy="50" rx="2.2" ry="2.6" fill="#1f1a14" />
}
