'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WaterReminderModalProps {
  isOpen: boolean
  /** User confirmed they drank → reset full interval. */
  onDrink: () => void
  /** User wants a short snooze → re-prompt in a few minutes. */
  onSnooze: () => void
}

/**
 * Gentle full-screen popup that nudges the user to drink water. Reuses
 * the Waddle visual language (charcoal + cream, soft rounded card,
 * hand-drawn penguin). No red, no warnings — Waddle just walked over
 * with a glass.
 *
 * The mascot here is an inline variant of WaddleMascot that includes a
 * water glass in one flipper; keeping it local avoids cluttering the
 * shared mascot component with one-off props.
 */
export function WaterReminderModal({ isOpen, onDrink, onSnooze }: WaterReminderModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => setMounted(true), 10)
      return () => window.clearTimeout(t)
    }
    setMounted(false)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="water-reminder-title"
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300',
          mounted ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onSnooze}
      />

      <div
        className={cn(
          'relative w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden',
          'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.97]',
        )}
      >
        <div className="px-6 pt-7 pb-2 flex flex-col items-center text-center">
          <WaddleWithWater className="w-32 h-32" />

          <h2
            id="water-reminder-title"
            className="mt-3 text-[1.35rem] font-semibold text-foreground tracking-wide"
            style={{ fontFamily: "'Caveat', 'Patrick Hand', 'Noto Sans TC', cursive" }}
          >
            該喝水囉～
          </h2>

          <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[18rem]">
            搖搖擺擺地工作了一陣子，<br />
            記得補一口水，再慢慢繼續。
          </p>
        </div>

        <div className="px-5 pb-5 pt-4 flex gap-2">
          <Button
            variant="secondary"
            onClick={onSnooze}
            className="flex-1 h-10 rounded-xl"
          >
            再過一下
          </Button>
          <Button
            onClick={onDrink}
            className="flex-1 h-10 rounded-xl gap-1.5"
          >
            <span aria-hidden>💧</span>
            好，去喝水
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Waddle holding a cream-colored glass of water. Built on the same vector
 * grammar as [components/branding/waddle-mascot.tsx] but with a small
 * flipper-arm + glass overlay. Kept local because nothing else in the app
 * needs this variant.
 */
function WaddleWithWater({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Waddle 拿著水杯"
      className={className}
    >
      {/* Soft yellow halo so the penguin reads as a focal token */}
      <circle cx="60" cy="62" r="50" fill="#f4d977" opacity="0.55" />

      {/* Body */}
      <path
        d="M40 26
           C38.5 19 34.5 17 32 19
           C30 21 30.5 24.5 35 29
           C29 34 25 43 25 58
           C25 81 38 98 60 98
           C82 98 95 81 95 58
           C95 43 91 34 85 29
           C89.5 24.5 90 21 88 19
           C85.5 17 81.5 19 80 26
           C74 23 67 22 60 22
           C53 22 46 23 40 26Z"
        fill="#3a342e"
        stroke="#1f1a14"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Belly */}
      <path
        d="M47 58
           C47 55 51 54 60 54
           C69 54 73 55 73 58
           C76 70 75 86 70 94
           C66 97 62 98 60 98
           C58 98 54 97 50 94
           C45 86 44 70 47 58Z"
        fill="#f5ead0"
        stroke="#1f1a14"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Eyes */}
      <circle cx="48" cy="52" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="72" cy="52" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="49" cy="53" r="3.5" fill="#1a1612" />
      <circle cx="73" cy="53" r="3.5" fill="#1a1612" />
      {/* tiny shine */}
      <circle cx="50.5" cy="51" r="1" fill="#fff" />
      <circle cx="74.5" cy="51" r="1" fill="#fff" />

      {/* Beak */}
      <ellipse cx="60" cy="61" rx="2.4" ry="2.8" fill="#1f1a14" />

      {/* Little blush */}
      <ellipse cx="40" cy="64" rx="3.5" ry="2" fill="#e89a9a" opacity="0.55" />
      <ellipse cx="80" cy="64" rx="3.5" ry="2" fill="#e89a9a" opacity="0.55" />

      {/* Right flipper reaching toward the glass */}
      <path
        d="M82 68
           C90 70 96 76 96 82
           C96 87 92 90 88 89
           C83 88 80 84 79 78Z"
        fill="#3a342e"
        stroke="#1f1a14"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Water glass — cream tinted with charcoal outline */}
      <g>
        <path
          d="M86 70
             L102 70
             L100 96
             C100 99 98 100 94 100
             C90 100 88 99 88 96 Z"
          fill="#f5ead0"
          stroke="#1f1a14"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Water inside */}
        <path
          d="M87.6 78
             L100.4 78
             L99.2 95.6
             C99.2 97.6 97.5 98.4 94 98.4
             C90.5 98.4 88.8 97.6 88.8 95.6 Z"
          fill="#9bc7d8"
          opacity="0.85"
        />
        {/* Surface highlight */}
        <ellipse cx="94" cy="78" rx="6.4" ry="1.2" fill="#fff" opacity="0.6" />
      </g>

      {/* Bubbles floating up */}
      <circle cx="106" cy="58" r="2" fill="#9bc7d8" opacity="0.85" />
      <circle cx="111" cy="50" r="1.4" fill="#9bc7d8" opacity="0.7" />
      <circle cx="108" cy="44" r="1" fill="#9bc7d8" opacity="0.55" />

      {/* Feet */}
      <ellipse cx="52" cy="99" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
      <ellipse cx="68" cy="99" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
    </svg>
  )
}
