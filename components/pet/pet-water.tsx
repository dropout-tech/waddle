'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'
import { WaterSettingsPanel } from '@/components/water/water-settings-panel'
import type { WaterVariant } from '@/lib/water-moment'
import styles from './pet-water.module.css'

/**
 * 喝水提醒 A「企鵝送水來」: the pieces the penguin (penguin-pet.tsx) draws while it brings water.
 * The phase machine (walk over → card → 乾杯 / 等等再喝 → walk home) lives in penguin-pet.tsx;
 * these are pure presentation keyed on `phase`. See lib/water-moment.ts for when A is used.
 */
export type PetWaterPhase = 'arrive' | 'card' | 'cheers' | 'later' | 'leave'

const INK = '#292b24'

/** The glass already approved for the old popup (viewBox 0 0 48 58), water split out so it can drain. */
function Glass() {
  return (
    <svg viewBox="0 0 48 58" aria-hidden="true">
      <path d="M8 18 L35 18 L32 49 C32 54 29 56 21.5 56 C14 56 11 54 11 49 Z" fill="#f5ead0" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <g className={styles.water}>
        <path d="M10 29 L33 29 L31.3 48.5 C31.3 52 28.8 53.5 21.5 53.5 C14.2 53.5 11.7 52 11.7 48.5 Z" fill="#9bc7d8" opacity="0.92" />
        <ellipse cx="21.5" cy="29" rx="11.5" ry="1.8" fill="#fff" opacity="0.65" />
      </g>
    </svg>
  )
}

/** Inside the penguin's sprite box: its glass, and the little toast sparkle while it raises it to you. */
export function PetWaterInHand({ phase }: { phase: PetWaterPhase }) {
  return (
    <>
      <span className={styles.glass} data-phase={phase} data-pet-water-glass aria-hidden="true">
        <Glass />
      </span>
      {phase === 'cheers' && (
        <>
          <svg className={styles.sparks} viewBox="0 0 60 60" aria-hidden="true">
            <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
              <path d="M30 14 L30 4" />
              <path d="M18 18 L11 11" />
              <path d="M42 18 L49 11" />
            </g>
            <g fill="#9bc7d8" stroke={INK} strokeWidth="1.4">
              <circle className={styles.d1} cx="22" cy="26" r="2.6" />
              <circle className={styles.d2} cx="38" cy="25" r="2.2" />
              <circle className={styles.d3} cx="30" cy="22" r="1.8" />
            </g>
          </svg>
        </>
      )}
    </>
  )
}

/** The small card beside the penguin: 乾杯 / 等等再喝 / ⋯ (on/off + interval in place). */
export function PetWaterCard({
  name,
  variant,
  isMobile,
  onCheers,
  onLater,
  onDisable,
}: {
  name: string
  variant: WaterVariant
  isMobile: boolean
  onCheers: () => void
  onLater: () => void
  onDisable: () => void
}) {
  const { t } = useI18n()
  const [showSettings, setShowSettings] = useState(false)
  return (
    <div
      className={styles.card}
      data-mobile={isMobile ? '' : undefined}
      data-pet-water-card
      role="status"
      aria-labelledby="pet-water-msg"
    >
      <span className={styles.name}>{name}</span>
      <p id="pet-water-msg" className={styles.msg}>
        {variant === 'break' ? t('剛好休息，順便喝口水。') : variant === 'focusEnded' ? t('這段專注告一段落。') : t('我端了一杯水來。')}
        <br />
        {variant === 'normal' ? t('喝一口，再慢慢繼續。') : variant === 'break' ? t('我已經倒好了。') : t('喝口水吧，我已經倒好了。')}
      </p>
      {showSettings && <WaterSettingsPanel className={styles.settings} onDisable={onDisable} />}
      <div className={styles.acts}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={onCheers} data-water-cheers>
          {t('乾杯')}
        </button>
        <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={onLater} data-water-later>
          {t('等等再喝')}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.more}`}
          aria-label={t('喝水提醒設定')}
          title={t('喝水提醒設定')}
          aria-expanded={showSettings}
          onClick={() => setShowSettings((v) => !v)}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/** 乾杯 replaces the card with one short line, so no half-empty card is left behind. */
export function PetWaterCheer({ isMobile }: { isMobile: boolean }) {
  const { t } = useI18n()
  return (
    <div className={styles.cheer} data-mobile={isMobile ? '' : undefined} data-pet-water-cheer>
      <b>{t('乾杯！')}</b>
      <span>{t('一起喝一口。')}</span>
    </div>
  )
}
