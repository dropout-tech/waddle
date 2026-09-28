import { t } from '@/lib/i18n'
import type { PetSettings } from './types'

/**
 * Phone reminders (native local notifications) spoken by the user's adopted
 * penguin: the title becomes 「{name}：呱！」 and the original title + body
 * move into the body, unchanged. Timing and logic are untouched. With no
 * adopted (or a hidden) penguin the wording stays exactly as before.
 *
 * The name is kept here (set from app/page.tsx) so the meeting-reminder
 * scheduler, which is called from several places, doesn't need it threaded
 * through every call site.
 */
let current: string | null = null

export function petVoiceName(pet: Pick<PetSettings, 'adopted' | 'enabled' | 'name'> | null | undefined): string | null {
  return pet?.adopted && pet.enabled !== false && pet.name ? pet.name : null
}
export function setPetVoice(pet: Pick<PetSettings, 'adopted' | 'enabled' | 'name'> | null | undefined) {
  current = petVoiceName(pet)
}
export function currentPetVoice(): string | null {
  return current
}

export function petVoiced(n: { title: string; body: string }, name: string | null = current): { title: string; body: string } {
  if (!name) return n
  return { title: t('{name}：呱！', { name }), body: n.body ? `${n.title}\n${n.body}` : n.title }
}
