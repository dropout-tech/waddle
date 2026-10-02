'use client'

import { useSyncExternalStore } from 'react'
import { useI18n } from '@/lib/i18n/react'
import { useUserSettings } from '@/components/user-settings-context'
import { getIglooSnapshot, openIgloo, subscribeIgloo } from '@/lib/igloo/store'
import { iglooLine } from '@/lib/igloo/lines'
import { localDay } from '@/lib/igloo/compute'
import { defaultPet } from '@/lib/pet/types'
import { IglooScene } from './igloo-scene'

const serverSnapshot = () => null

/** 每日簽到 page: a small window onto the igloo, one tap from the full scene. */
export function IglooCard() {
  const { t, lang } = useI18n()
  const state = useSyncExternalStore(subscribeIgloo, getIglooSnapshot, serverSnapshot)
  const settings = useUserSettings()
  if (!state) return null
  const pet = settings?.pet
  const look = pet?.adopted ? pet : defaultPet(lang)
  const name = look.name || 'Huddle'
  const per = state.bricksPerIgloo
  const full = state.bricksInCurrent === 0 && state.completedIgloos > 0 && state.mood === 'proud'
  const x = full ? per : state.bricksInCurrent
  const n = full ? state.completedIgloos : state.completedIgloos + 1

  return (
    <button
      type="button"
      onClick={openIgloo}
      data-igloo-card
      className="group mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-4 sm:p-4"
    >
      <span className="block w-[46%] max-w-64 shrink-0">
        <IglooScene
          compact
          view={{ completed: state.completedIgloos, bricks: state.bricksInCurrent, per, mood: state.mood }}
          night={state.mood === 'sleeping'}
          look={look}
          className="rounded-xl"
          label={t('冰屋場景：第 {n} 座冰屋蓋了 {x}/{per} 塊冰磚，村落裡有 {built} 座蓋好的冰屋。', { n, x, per, built: state.completedIgloos })}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t('企鵝的冰屋')}</span>
        <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
          {t('第 {n} 座冰屋', { n })} · {t('{x} / {per} 塊', { x, per })}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-foreground/80">{iglooLine(state, lang, `${localDay(new Date())}:${name}`)}</span>
        <span className="mt-1.5 inline-flex min-h-8 items-center text-xs font-semibold text-primary group-hover:underline group-hover:underline-offset-4">
          {t('去冰屋看看')}
        </span>
      </span>
    </button>
  )
}
