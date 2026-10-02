import { cn } from '@/lib/utils'
import styles from './brain-dump.module.css'

/** Poses from the official hand-drawn set in public/art/penguin/ (no new
 *  art needed): stand = listening, carry = holding a note over its head,
 *  happy = done, sleep = it's late. */
export type PenguinPose = 'stand' | 'carry' | 'happy' | 'sleep'

export function PenguinArt({ pose, className }: { pose: PenguinPose; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static sprite; next/image wrappers/lazy logic not wanted
    <img
      src={`/art/penguin/${pose}.webp`}
      alt=""
      aria-hidden="true"
      width={240}
      height={240}
      draggable={false}
      decoding="async"
      className={cn(styles.penguin, 'block h-full w-full select-none object-contain', className)}
    />
  )
}
