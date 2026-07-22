import Image from 'next/image'
import { cn } from '@/lib/utils'

interface SkatingPenguinProps {
  className?: string
}

/**
 * Daily-clear celebration using the approved Huddle artwork. Huddle turns
 * sideways for the belly slide while the speed lines and snow specks retain
 * the playful left-to-right movement of the original celebration.
 */
export function SkatingPenguin({ className }: SkatingPenguinProps) {
  return (
    <div aria-hidden="true" className={cn('relative block aspect-[16/9]', className)}>
      <span className="absolute left-[1%] top-[24%] h-0.5 w-[20%] rounded-full bg-foreground/35" />
      <span className="absolute left-[-2%] top-[44%] h-0.5 w-[24%] rounded-full bg-foreground/45" />
      <span className="absolute left-[3%] top-[64%] h-0.5 w-[18%] rounded-full bg-foreground/30" />
      <span className="absolute left-[4%] top-[78%] h-1 w-1 rounded-full bg-foreground/25" />
      <span className="absolute left-[13%] top-[84%] h-1.5 w-1.5 rounded-full bg-foreground/30" />
      <span className="absolute left-[21%] top-[76%] h-1 w-1 rounded-full bg-foreground/20" />

      <span className="absolute -inset-y-[12%] left-[21%] right-[-2%] block rotate-[78deg]">
        <Image
          src="/huddle-mascot.png"
          alt=""
          width={512}
          height={512}
          loading="eager"
          aria-hidden="true"
          draggable={false}
          className="h-full w-full object-contain"
        />
      </span>
    </div>
  )
}
