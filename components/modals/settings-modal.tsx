'use client'

import { useState } from 'react'
import { X, Clock, Coffee, Palette, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserSettings, TimeBlock } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SettingsModalProps {
  isOpen: boolean
  settings: UserSettings
  timeBlocks: TimeBlock[]
  onClose: () => void
  onSave: (settings: UserSettings, timeBlocks: TimeBlock[]) => void
}

const PRESET_COLORS = [
  '#FF6B6B', '#4A90D9', '#66BB6A', '#FFB74D', '#9575CD',
  '#4DD0E1', '#F06292', '#AED581', '#FFD54F', '#90A4AE',
]

export function SettingsModal({
  isOpen,
  settings,
  timeBlocks,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings)
  const [localTimeBlocks, setLocalTimeBlocks] = useState<TimeBlock[]>(timeBlocks)

  // Find or create lunch break block
  const lunchBlock = localTimeBlocks.find(tb => tb.type === 'break') || {
    id: 'tb-lunch',
    date: '',
    startTime: localSettings.lunchBreak.startTime,
    endTime: localSettings.lunchBreak.endTime,
    type: 'break' as const,
    label: '午休',
    color: localSettings.lunchBreak.color,
    isRecurring: true,
  }

  // Find or create buffer block
  const bufferBlock = localTimeBlocks.find(tb => tb.type === 'buffer') || {
    id: 'tb-buffer',
    date: '',
    startTime: '16:00',
    endTime: '16:30',
    type: 'buffer' as const,
    label: '緩衝時間',
    color: localSettings.bufferTime.color,
    isRecurring: false,
  }

  const handleSave = () => {
    // Update time blocks with new settings
    const updatedBlocks = localTimeBlocks.map(tb => {
      if (tb.type === 'break') {
        return {
          ...tb,
          startTime: localSettings.lunchBreak.startTime,
          endTime: localSettings.lunchBreak.endTime,
          color: localSettings.lunchBreak.color,
        }
      }
      if (tb.type === 'buffer') {
        return {
          ...tb,
          color: localSettings.bufferTime.color,
        }
      }
      return tb
    })

    onSave(localSettings, updatedBlocks)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">設定</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Calendar Time Range */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="w-4 h-4" />
              日曆顯示時間範圍
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">開始時間</label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={localSettings.calendarStartHour}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    calendarStartHour: parseInt(e.target.value) || 0
                  }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">結束時間</label>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={localSettings.calendarEndHour}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    calendarEndHour: parseInt(e.target.value) || 24
                  }))}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Lunch Break Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Coffee className="w-4 h-4" />
                午休時間
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.lunchBreak.enabled}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    lunchBreak: { ...prev.lunchBreak, enabled: e.target.checked }
                  }))}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground">啟用</span>
              </label>
            </div>
            
            {localSettings.lunchBreak.enabled && (
              <div className="space-y-3 pl-6 border-l-2 border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">開始時間</label>
                    <Input
                      type="time"
                      value={localSettings.lunchBreak.startTime}
                      onChange={(e) => setLocalSettings(prev => ({
                        ...prev,
                        lunchBreak: { ...prev.lunchBreak, startTime: e.target.value }
                      }))}
                      className="h-9 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">結束時間</label>
                    <Input
                      type="time"
                      value={localSettings.lunchBreak.endTime}
                      onChange={(e) => setLocalSettings(prev => ({
                        ...prev,
                        lunchBreak: { ...prev.lunchBreak, endTime: e.target.value }
                      }))}
                      className="h-9 font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">顯示顏色</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setLocalSettings(prev => ({
                          ...prev,
                          lunchBreak: { ...prev.lunchBreak, color }
                        }))}
                        className={cn(
                          'w-7 h-7 rounded-full border-2 transition-all',
                          localSettings.lunchBreak.color === color
                            ? 'border-foreground scale-110'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={localSettings.lunchBreak.color}
                      onChange={(e) => setLocalSettings(prev => ({
                        ...prev,
                        lunchBreak: { ...prev.lunchBreak, color: e.target.value }
                      }))}
                      className="w-7 h-7 rounded-full cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Buffer Time Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="w-4 h-4" />
                緩衝時間
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.bufferTime.enabled}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    bufferTime: { ...prev.bufferTime, enabled: e.target.checked }
                  }))}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground">啟用</span>
              </label>
            </div>

            {localSettings.bufferTime.enabled && (
              <div className="space-y-3 pl-6 border-l-2 border-border">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">預設時長 (分鐘)</label>
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    step={5}
                    value={localSettings.bufferTime.defaultDuration}
                    onChange={(e) => setLocalSettings(prev => ({
                      ...prev,
                      bufferTime: { ...prev.bufferTime, defaultDuration: parseInt(e.target.value) || 30 }
                    }))}
                    className="h-9 w-24"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">顯示顏色</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setLocalSettings(prev => ({
                          ...prev,
                          bufferTime: { ...prev.bufferTime, color }
                        }))}
                        className={cn(
                          'w-7 h-7 rounded-full border-2 transition-all',
                          localSettings.bufferTime.color === color
                            ? 'border-foreground scale-110'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={localSettings.bufferTime.color}
                      onChange={(e) => setLocalSettings(prev => ({
                        ...prev,
                        bufferTime: { ...prev.bufferTime, color: e.target.value }
                      }))}
                      className="w-7 h-7 rounded-full cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-secondary/20">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            儲存
          </Button>
        </div>
      </div>
    </div>
  )
}
