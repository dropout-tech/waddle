import { cn } from '@/lib/utils'

interface WaddleMascotProps {
  className?: string
  /** Render the warm-yellow rounded background behind the penguin (app-icon look). */
  withBackground?: boolean
  /** Hides the mascot from screen readers when used decoratively next to text. */
  decorative?: boolean
}

export function WaddleMascot({
  className,
  withBackground = false,
  decorative = true,
}: WaddleMascotProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Waddle 企鵝吉祥物'}
      className={cn('block', className)}
    >
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

      {/* Eyes: cream rim circles with black pupils */}
      <circle cx="38" cy="42" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="62" cy="42" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="38" cy="42" r="3.5" fill="#1a1612" />
      <circle cx="62" cy="42" r="3.5" fill="#1a1612" />

      {/* Beak — small dark dot between the eyes */}
      <ellipse cx="50" cy="50" rx="2.2" ry="2.6" fill="#1f1a14" />

      {/* Feet — two little ovals peeking out at the bottom */}
      <ellipse cx="42" cy="89" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
      <ellipse cx="58" cy="89" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
    </svg>
  )
}
