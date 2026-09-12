import type { ScratchpadItem } from '@/lib/types'

export interface CanvasGeometry { x: number; y: number; width: number; height: number }
export function isCanvasItem(item: ScratchpadItem): boolean {
  return !!item.metadata?.canvas && typeof item.metadata.canvas === 'object'
}
export function canvasGeometry(item: ScratchpadItem): CanvasGeometry {
  const value = item.metadata?.canvas ?? {}
  const finite = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return { x: finite(value.x, 32), y: finite(value.y, 32), width: Math.max(200, Math.min(2000, finite(value.width, 280))), height: Math.max(160, Math.min(2000, finite(value.height, 220))) }
}
