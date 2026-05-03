import type { SlotType } from '@/lib/types'
import { CheckSquare, Coffee, Clock, Crosshair, User, Layers } from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
  CheckSquare,
  Coffee,
  Clock,
  Crosshair,
  User,
  Layers,
}

interface SlotIconProps {
  slotType: SlotType
  className?: string
}

export function SlotIcon({ slotType, className = 'w-4 h-4' }: SlotIconProps) {
  if (slotType.iconType === 'lucide') {
    const IconComp = ICON_MAP[slotType.icon] || Clock
    return <IconComp className={className} style={{ color: slotType.color }} />
  }
  if (!slotType.icon) {
    return (
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: slotType.color }}
        aria-hidden="true"
      />
    )
  }
  return <span className="text-base" aria-hidden="true">{slotType.icon}</span>
}
