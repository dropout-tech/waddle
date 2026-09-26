'use client'

import { useId, useState } from 'react'
import { useI18n } from '@/lib/i18n/react'
import { cleanPetName, defaultPet, petNameLength, PET_NAME_MAX } from '@/lib/pet/types'
import { PetEditor, type PetLook } from './pet-editor'

/**
 * 「領養你的企鵝」 — a small, non-blocking card (not a modal) shown once,
 * after onboarding, to anyone who hasn't adopted yet. Skipping still gives
 * you a penguin (default name + look); everything can be changed later in
 * Settings → 企鵝.
 */
export function PetAdoptCard({
  isMobile,
  lang,
  onAdopt,
}: {
  isMobile: boolean
  lang: 'zh-TW' | 'en'
  onAdopt: (look: PetLook, skipped: boolean) => Promise<void> | void
}) {
  const { t } = useI18n()
  const titleId = useId()
  const base = defaultPet(lang)
  const [look, setLook] = useState<PetLook>({ name: base.name, color: base.color, accessory: base.accessory })
  const [busy, setBusy] = useState(false)
  const len = petNameLength(look.name.trim())
  const valid = len >= 1 && len <= PET_NAME_MAX

  const finish = async (skipped: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      await onAdopt(skipped ? { name: base.name, color: base.color, accessory: base.accessory } : { ...look, name: cleanPetName(look.name) }, skipped)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      data-pet-ui
      data-pet-adopt
      className="fixed z-40 rounded-2xl border border-border bg-card text-card-foreground shadow-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
      style={
        isMobile
          ? { left: 12, right: 12, bottom: 'calc(68px + env(safe-area-inset-bottom))', maxHeight: 'calc(100dvh - 140px)', overflowY: 'auto' }
          : { left: 16, bottom: 64, width: 360 }
      }
    >
      <h2 id={titleId} className="text-base font-semibold tracking-tight">{t('領養你的企鵝')}</h2>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        {t('每個人都有一隻自己的企鵝。牠住在角落，偶爾說點荒謬的話，也會提醒你重要的事。')}
      </p>
      <PetEditor value={look} onChange={setLook} compact={isMobile} />
      <p className="mt-3 text-[11px] text-muted-foreground">{t('領養後隨時可以到「設定 → 企鵝」修改。')}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          data-pet-skip
          onClick={() => void finish(true)}
          disabled={busy}
          className="min-h-10 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('先跳過')}
        </button>
        <button
          type="button"
          data-pet-adopt-confirm
          onClick={() => void finish(false)}
          disabled={busy || !valid}
          className="min-h-10 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('領養')}
        </button>
      </div>
    </div>
  )
}
