'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Calendar, Clock, Palette, Trash2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { DateField, TimeField } from '@/components/ui/date-time-field'
import type { TimeBlock, SlotType } from '@/lib/types'
import { ModalShell } from '@/components/modals/modal-shell'

interface TimeBlockModalProps {
  block: TimeBlock | null
  isOpen: boolean
  slotTypes: SlotType[]
  onClose: () => void
  onSave: (id: string, updates: Partial<TimeBlock>) => void
  onDelete?: (id: string) => void
}

const QUICK_DURATIONS = [15, 30, 60, 90, 120] as const

function parseTime(t: string): number | null {
  const [hh, mm] = t.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return hh * 60 + mm
}

function formatTimeFromMinutes(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, minutes))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
}

const PRESET_COLORS = [
  '#F6A854', // amber
  '#9BBFAC', // sage
  '#D46B8A', // rose
  '#7DA2B8', // blue-grey
  '#B591C7', // lavender
  '#C9847A', // terracotta
  '#8FAE8B', // moss
  '#A8927F', // taupe
] as const

export function TimeBlockModal({
  block,
  isOpen,
  slotTypes,
  onClose,
  onSave,
  onDelete,
}: TimeBlockModalProps) {
  const [type, setType] = useState('')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [color, setColor] = useState('')

  // Re-seed local form state whenever the parent passes a different block.
  useEffect(() => {
    if (!block) return
    setType(block.type)
    setLabel(block.label)
    setDate(block.date)
    setStartTime(block.startTime)
    setEndTime(block.endTime)
    setColor(block.color)
  }, [block?.id])

  // Top-level slot types only (skip parent groupings — flat list is enough).
  // Workspace-bound types are also excluded since those are tasks, not blocks.
  const availableTypes = useMemo(
    () => slotTypes.filter(s => !s.workspaceId && !s.parentId === false ? true : !s.workspaceId),
    [slotTypes]
  )

  const startMin = parseTime(startTime)
  const endMin = parseTime(endTime)
  const duration = startMin !== null && endMin !== null ? endMin - startMin : null

  if (!block) return null

  const handleSelectType = (slotKey: string) => {
    setType(slotKey)
    const picked = slotTypes.find(s => s.key === slotKey)
    if (picked) {
      // Adopt the type's color + label as defaults — but only if the user
      // hasn't customized them away. (If color matches the *previous* type's
      // color it was probably auto-set, so we replace it.)
      if (color === block.color) setColor(picked.color)
      if (label === block.label) setLabel(picked.label)
    }
  }

  const setEndFromDuration = (minutes: number) => {
    if (startMin === null) return
    setEndTime(formatTimeFromMinutes(startMin + minutes))
  }

  const adjustEnd = (deltaMin: number) => {
    const base = endMin ?? (startMin !== null ? startMin + 60 : 9 * 60)
    setEndTime(formatTimeFromMinutes(base + deltaMin))
  }

  const handleSave = () => {
    if (!label.trim()) return
    if (duration !== null && duration <= 0) return
    onSave(block.id, {
      type,
      label: label.trim(),
      date,
      startTime,
      endTime,
      color,
    })
    onClose()
  }

  const handleDelete = () => {
    if (!onDelete) return
    if (window.confirm(`刪除「${block.label}」這個時間區塊？`)) {
      onDelete(block.id)
      onClose()
    }
  }

  const body = (
    <>
      {/* Color accent top stripe */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: color }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">編輯時間區塊</h2>
          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="刪除"
                aria-label="刪除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              aria-label="關閉"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Type picker */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">類型</label>
            <div className="flex flex-wrap gap-2">
              {availableTypes.map(t => {
                const active = type === t.key
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelectType(t.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-muted/40 text-foreground'
                    )}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">標籤</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="輸入名稱..."
              className="h-10"
              autoFocus={false}
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              日期
            </label>
            <DateField
              value={date}
              onChange={setDate}
              className="h-10"
              aria-label="日期"
              clearable={false}
            />
          </div>

          {/* Time range */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                時段
              </label>
              {duration !== null && (
                <span
                  className={cn(
                    'text-[11px] font-medium px-2 py-0.5 rounded-full',
                    duration <= 0
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {duration <= 0 ? '結束需晚於開始' : `時長 ${formatDuration(duration)}`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <TimeField
                value={startTime}
                onChange={(v) => {
                  setStartTime(v)
                  // Preserve duration when start changes mid-edit.
                  const ns = parseTime(v)
                  if (ns !== null && endMin !== null && duration !== null && duration > 0) {
                    setEndTime(formatTimeFromMinutes(ns + duration))
                  }
                }}
                className="h-10 font-mono text-center"
                aria-label="開始時間"
              />
              <span className="text-muted-foreground text-sm" aria-hidden="true">→</span>
              <TimeField
                value={endTime}
                onChange={setEndTime}
                className="h-10 font-mono text-center"
                aria-label="結束時間"
              />
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-muted-foreground mr-0.5">快速設定</span>
              {QUICK_DURATIONS.map(m => {
                const active = duration === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEndFromDuration(m)}
                    disabled={startMin === null}
                    aria-pressed={active}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-medium transition-all',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed'
                    )}
                  >
                    {formatDuration(m)}
                  </button>
                )
              })}
              <span className="mx-0.5 w-px h-3 bg-border" />
              <button
                type="button"
                onClick={() => adjustEnd(-15)}
                className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-muted-foreground hover:bg-secondary/80 transition"
              >
                −15
              </button>
              <button
                type="button"
                onClick={() => adjustEnd(15)}
                className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-muted-foreground hover:bg-secondary/80 transition"
              >
                +15
              </button>
            </div>
          </div>

          {/* Color override */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Palette className="w-3.5 h-3.5" />
              顏色
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all',
                    color === c && 'ring-2 ring-offset-2 ring-primary scale-110'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`選擇顏色 ${c}`}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-7 p-0.5 rounded cursor-pointer"
                aria-label="自訂顏色"
              />
            </div>
          </div>
        </div>

        {/* Sticky footer with save */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!label.trim() || (duration !== null && duration <= 0)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            儲存
          </button>
        </div>
    </>
  )

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} size="md" ariaLabel="編輯時間區塊">
      {body}
    </ModalShell>
  )
}
