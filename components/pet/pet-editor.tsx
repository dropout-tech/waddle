'use client'

import { useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import {
  PET_ACCESSORIES,
  PET_ACCESSORY_LABELS,
  PET_COLORS,
  PET_COLOR_STYLES,
  PET_NAME_MAX,
  petNameLength,
  type PetAccessory,
  type PetColor,
} from '@/lib/pet/types'
import { PetSprite } from './pet-sprite'

export interface PetLook {
  name: string
  color: PetColor
  accessory: PetAccessory
}

/**
 * Name + colour + accessory controls, shared by the adoption card and the
 * settings section. Controlled; the caller decides when to persist.
 * `name` is the raw input (may be empty / too long while typing).
 */
export function PetEditor({
  value,
  onChange,
  onNameCommit,
  compact = false,
}: {
  value: PetLook
  onChange: (next: PetLook) => void
  /** Fired on blur / Enter — settings uses it to save the name. */
  onNameCommit?: () => void
  compact?: boolean
}) {
  const { t } = useI18n()
  const nameId = useId()
  const hintId = useId()
  const len = petNameLength(value.name.trim())
  const nameError = len === 0 ? t('請輸入名字') : len > PET_NAME_MAX ? t('名字最多 12 個字') : null

  return (
    <div className={cn('flex gap-4', compact ? 'items-start' : 'items-center')}>
      <div
        className={cn('shrink-0 rounded-2xl bg-secondary/60 grid place-items-center', compact ? 'w-16 h-16' : 'w-20 h-20')}
        aria-label={t('預覽')}
        role="img"
      >
        <span className={compact ? 'block w-12 h-12' : 'block w-16 h-16'}>
          <PetSprite color={value.color} accessory={value.accessory} />
        </span>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="space-y-1">
          <label htmlFor={nameId} className="text-xs font-medium text-muted-foreground">{t('企鵝名字')}</label>
          <input
            id={nameId}
            data-pet-name-input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            onBlur={() => onNameCommit?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                onNameCommit?.()
              }
            }}
            maxLength={40}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={hintId}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="off"
            enterKeyHint="done"
          />
          <p id={hintId} className={cn('text-[11px]', nameError ? 'text-destructive' : 'text-muted-foreground')}>
            {nameError ?? t('1–12 個字')}
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground mb-1.5">{t('毛色')}</legend>
          <div className="flex flex-wrap gap-2">
            {PET_COLORS.map((c) => {
              const on = value.color === c
              return (
                <button
                  key={c}
                  type="button"
                  data-pet-color={c}
                  aria-pressed={on}
                  aria-label={t(PET_COLOR_STYLES[c].label)}
                  title={t(PET_COLOR_STYLES[c].label)}
                  onClick={() => onChange({ ...value, color: c })}
                  className={cn(
                    'relative w-9 h-9 rounded-full border-2 grid place-items-center transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    on ? 'border-foreground' : 'border-transparent',
                  )}
                >
                  <span className="block w-7 h-7 rounded-full" style={{ background: `linear-gradient(135deg, ${PET_COLOR_STYLES[c].swatch} 55%, ${PET_COLOR_STYLES[c].accent} 55%)` }} />
                  {on && <Check className="absolute w-3.5 h-3.5 text-white drop-shadow" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground mb-1.5">{t('配件')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {PET_ACCESSORIES.map((a) => {
              const on = value.accessory === a
              return (
                <button
                  key={a}
                  type="button"
                  data-pet-accessory={a}
                  aria-pressed={on}
                  onClick={() => onChange({ ...value, accessory: a })}
                  className={cn(
                    'min-h-9 px-3 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
                  )}
                >
                  {a === 'none' ? t('沒有配件') : t(PET_ACCESSORY_LABELS[a])}
                </button>
              )
            })}
          </div>
        </fieldset>
      </div>
    </div>
  )
}
