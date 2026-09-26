'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { cleanPetName, defaultPet, petNameLength, PET_CHATTINESS, PET_NAME_MAX, type PetChattiness, type PetSettings } from '@/lib/pet/types'
import { PetEditor, type PetLook } from './pet-editor'

const CHATTY_LABEL: Record<PetChattiness, { zh: string; en: string }> = {
  low: { zh: '少（約 2–3 小時）', en: 'Rarely (~2–3 h)' },
  medium: { zh: '中（約 1–1.5 小時）', en: 'Sometimes (~1–1.5 h)' },
  high: { zh: '多（約 30 分鐘）', en: 'Often (~30 min)' },
}

/**
 * Settings → 企鵝. Every control saves immediately through the narrow
 * `setPet` (the pet is not part of the modal's 儲存 draft). Editing here
 * also counts as adopting, so the adoption card won't show up afterwards.
 */
export function PetSettingsSection({ pet, onSetPet }: { pet: PetSettings | null; onSetPet: (next: PetSettings) => Promise<void> | void }) {
  const { t, lang } = useI18n()
  const current: PetSettings = pet ?? defaultPet(lang)
  const [look, setLook] = useState<PetLook>({ name: current.name, color: current.color, accessory: current.accessory })
  // Follow outside changes (another device, the adoption card) while the name isn't being edited.
  useEffect(() => {
    setLook((l) => ({ name: document.activeElement?.hasAttribute('data-pet-name-input') ? l.name : current.name, color: current.color, accessory: current.accessory }))
  }, [current.name, current.color, current.accessory])

  const save = (patch: Partial<PetSettings>) => {
    void onSetPet({ ...current, adopted: true, adoptedAt: current.adoptedAt ?? new Date().toISOString(), ...patch })
  }

  const onLook = (next: PetLook) => {
    setLook(next)
    if (next.color !== look.color || next.accessory !== look.accessory) save({ color: next.color, accessory: next.accessory })
  }
  const commitName = () => {
    const len = petNameLength(look.name.trim())
    if (len < 1 || len > PET_NAME_MAX) return
    const name = cleanPetName(look.name)
    if (name !== current.name) save({ name })
  }

  return (
    <div className="space-y-4" data-pet-settings>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden="true">🐧</span>
        {t('企鵝')}
      </h3>

      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex-1 pr-4">
          <div className="text-sm text-foreground">{t('顯示企鵝')}</div>
          <div className="text-xs text-muted-foreground">{t('關掉後企鵝會回家休息，隨時可以再打開。')}</div>
        </div>
        <input
          type="checkbox"
          data-pet-enabled
          checked={current.adopted ? current.enabled : true}
          onChange={(e) => save({ enabled: e.target.checked })}
          className="w-4 h-4 rounded border-border accent-primary"
        />
      </label>

      <PetEditor value={look} onChange={onLook} onNameCommit={commitName} />

      <div className="space-y-2">
        <div>
          <div className="text-sm text-foreground">{t('說話頻率')}</div>
          <div className="text-xs text-muted-foreground">{t('閒著的時候多久說一句話（專注計時中不會說）。')}</div>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('說話頻率')}>
          {PET_CHATTINESS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={current.chattiness === c}
              data-pet-chattiness={c}
              onClick={() => save({ chattiness: c })}
              className={cn(
                'min-h-9 px-3 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                current.chattiness === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
              )}
            >
              {lang === 'en' ? CHATTY_LABEL[c].en : CHATTY_LABEL[c].zh}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex-1 pr-4">
          <div className="text-sm text-foreground">{t('專注時保持安靜')}</div>
          <div className="text-xs text-muted-foreground">{t('專注計時進行中不說話，計時結束才會出聲。')}</div>
        </div>
        <input
          type="checkbox"
          data-pet-quiet-focus
          checked={current.quietDuringFocus}
          onChange={(e) => save({ quietDuringFocus: e.target.checked })}
          className="w-4 h-4 rounded border-border accent-primary"
        />
      </label>
    </div>
  )
}
