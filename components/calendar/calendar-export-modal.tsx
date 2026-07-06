'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, X, Copy, Check, Sun, Moon } from 'lucide-react'
import { toPng } from 'html-to-image'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { toDateString } from '@/lib/calendar-utils'
import { isNative } from '@/lib/platform'
import { saveOrShareBlob, copyImageToClipboard } from '@/lib/share'
import type { Workspace, TimeBlock } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CalendarExportView,
  type CalendarExportViewOptions,
} from './calendar-export-view'

interface CalendarExportModalProps {
  isOpen: boolean
  onClose: () => void
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  startHour: number
  endHour: number
  /** Selected date in the calendar — used to seed reasonable defaults. */
  selectedDate: Date
}

type Preset = 'today' | 'thisWeek' | 'thisMonth' | 'custom'

/** Monday-anchored week for the date that contains the supplied moment. */
function weekRange(d: Date): [Date, Date] {
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  const start = new Date(d)
  start.setDate(start.getDate() - dow)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return [start, end]
}

/** First-to-last-day-of-month range. */
function monthRange(d: Date): [Date, Date] {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return [start, end]
}

const MAX_DAYS = 14

export function CalendarExportModal({
  isOpen,
  onClose,
  workspaces,
  timeBlocks,
  startHour,
  endHour,
  selectedDate,
}: CalendarExportModalProps) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [preset, setPreset] = useState<Preset>('thisWeek')
  const [startStr, setStartStr] = useState<string>(() => toDateString(weekRange(selectedDate)[0]))
  const [endStr, setEndStr] = useState<string>(() => toDateString(weekRange(selectedDate)[1]))
  const [options, setOptions] = useState<CalendarExportViewOptions>({
    showTitles: true,
    showNotes: false,
    theme: 'light',
  })
  const [isExporting, setIsExporting] = useState(false)
  const [justCopied, setJustCopied] = useState(false)

  // Re-seed dates whenever the modal opens so a stale custom range from a
  // previous session doesn't surface. Reset to "this week" anchored on the
  // currently viewed date.
  useEffect(() => {
    if (!isOpen) return
    const [s, e] = weekRange(selectedDate)
    setPreset('thisWeek')
    setStartStr(toDateString(s))
    setEndStr(toDateString(e))
  }, [isOpen, selectedDate])

  useBodyScrollLock(isOpen)

  const startDate = useMemo(() => {
    const [y, m, d] = startStr.split('-').map(Number)
    return new Date(y || 2026, (m || 1) - 1, d || 1)
  }, [startStr])
  const endDate = useMemo(() => {
    const [y, m, d] = endStr.split('-').map(Number)
    return new Date(y || 2026, (m || 1) - 1, d || 1)
  }, [endStr])

  const dayCount = useMemo(() => {
    const ms = endDate.getTime() - startDate.getTime()
    return Math.max(1, Math.round(ms / 86400000) + 1)
  }, [startDate, endDate])

  const isRangeValid = endDate.getTime() >= startDate.getTime() && dayCount <= MAX_DAYS

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'today') {
      const today = new Date()
      setStartStr(toDateString(today))
      setEndStr(toDateString(today))
    } else if (p === 'thisWeek') {
      const [s, e] = weekRange(selectedDate)
      setStartStr(toDateString(s))
      setEndStr(toDateString(e))
    } else if (p === 'thisMonth') {
      const [s, e] = monthRange(selectedDate)
      setStartStr(toDateString(s))
      setEndStr(toDateString(e))
    }
    // For 'custom' we don't touch the dates — user-edited values remain.
  }

  // When the user manually changes a date, fall back to "custom" so the
  // preset chips don't lie about which range is active.
  const onStartChange = (v: string) => {
    setStartStr(v)
    setPreset('custom')
  }
  const onEndChange = (v: string) => {
    setEndStr(v)
    setPreset('custom')
  }

  const captureImage = async (): Promise<Blob | null> => {
    const node = exportRef.current
    if (!node) return null
    // pixelRatio: 2 → roughly retina-quality output (2160px wide for the
    // 1080px view), good for sharing on social without looking soft.
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      // Subtle but important: skip fonts the browser doesn't have access to
      // (avoids the capture stalling on a font fetch that's mid-flight).
      skipFonts: false,
      // Force a clean background even though our view paints its own —
      // belt-and-suspenders against transparent backgrounds.
      backgroundColor: options.theme === 'dark' ? '#1f2024' : '#fffdf7',
    })
    const res = await fetch(dataUrl)
    return await res.blob()
  }

  const handleDownload = async () => {
    if (!isRangeValid) {
      toast.error('日期範圍無效')
      return
    }
    setIsExporting(true)
    try {
      const blob = await captureImage()
      if (!blob) throw new Error('capture failed')
      // Pure-ASCII filename so it survives cross-platform downloads and the
      // native share sheet. On native this opens the iOS share sheet; on web it
      // triggers a normal download.
      await saveOrShareBlob(blob, `huddle-schedule-${startStr}_${endStr}.png`)
      toast.success(isNative() ? '已開啟分享' : '已下載')
    } catch (err) {
      console.error('[export] download failed', err)
      toast.error('匯出失敗，請再試一次')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCopy = async () => {
    if (!isRangeValid) {
      toast.error('日期範圍無效')
      return
    }
    setIsExporting(true)
    try {
      const blob = await captureImage()
      if (!blob) throw new Error('capture failed')
      // Web copies the image to the clipboard; native degrades to the share
      // sheet (clipboard image write isn't supported there).
      const result = await copyImageToClipboard(blob, `huddle-schedule-${startStr}_${endStr}.png`)
      if (result === 'unsupported') {
        toast.error('此裝置不支援複製圖片，請改用下載')
        return
      }
      if (result === 'copied') {
        setJustCopied(true)
        window.setTimeout(() => setJustCopied(false), 1800)
        toast.success('已複製到剪貼簿')
      } else {
        toast.success('已開啟分享')
      }
    } catch (err) {
      console.error('[export] copy failed', err)
      toast.error('複製失敗，請改用下載')
    } finally {
      setIsExporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative w-full h-full md:h-[90vh] md:max-w-6xl bg-card md:rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">匯出行程圖檔</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              選擇日期範圍與選項，下載或複製分享給朋友
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Controls — fixed width on desktop, full row on mobile */}
          <div className="md:w-72 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto p-5 space-y-5 bg-muted/20">
            {/* Quick presets */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                日期範圍
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['today', '今天'],
                  ['thisWeek', '本週'],
                  ['thisMonth', '本月'],
                  ['custom', '自訂'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      preset === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">起始</label>
                  <Input
                    type="date"
                    value={startStr}
                    onChange={(e) => onStartChange(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">結束</label>
                  <Input
                    type="date"
                    value={endStr}
                    onChange={(e) => onEndChange(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className={cn('text-[11px]', !isRangeValid ? 'text-destructive' : 'text-muted-foreground')}>
                  共 {dayCount} 天
                  {dayCount > MAX_DAYS && `（最多 ${MAX_DAYS} 天）`}
                  {endDate.getTime() < startDate.getTime() && '（結束日期需在起始之後）'}
                </div>
              </div>
            </div>

            {/* Privacy options */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                顯示選項
              </div>
              <div className="space-y-2">
                <label className="flex items-center justify-between cursor-pointer text-xs">
                  <span className="text-foreground">顯示任務名稱</span>
                  <input
                    type="checkbox"
                    checked={options.showTitles}
                    onChange={(e) => setOptions((o) => ({ ...o, showTitles: e.target.checked }))}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer text-xs">
                  <span className={cn('text-foreground', !options.showTitles && 'opacity-40')}>
                    顯示備註
                  </span>
                  <input
                    type="checkbox"
                    checked={options.showNotes}
                    disabled={!options.showTitles}
                    onChange={(e) => setOptions((o) => ({ ...o, showNotes: e.target.checked }))}
                    className="w-4 h-4 rounded border-border accent-primary disabled:opacity-40"
                  />
                </label>
                {!options.showTitles && (
                  <p className="text-[10px] text-muted-foreground leading-snug bg-muted/40 px-2 py-1.5 rounded">
                    隱私模式：只顯示時段顏色，不會洩漏任務名稱。
                  </p>
                )}
              </div>
            </div>

            {/* Theme */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                主題
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOptions((o) => ({ ...o, theme: 'light' }))}
                  className={cn(
                    'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    options.theme === 'light'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sun className="w-3 h-3" /> 淺色
                </button>
                <button
                  type="button"
                  onClick={() => setOptions((o) => ({ ...o, theme: 'dark' }))}
                  className={cn(
                    'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    options.theme === 'dark'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Moon className="w-3 h-3" /> 深色
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleDownload}
                disabled={isExporting || !isRangeValid}
                className="w-full gap-2"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                下載 PNG
              </Button>
              <Button
                onClick={handleCopy}
                disabled={isExporting || !isRangeValid}
                variant="outline"
                className="w-full gap-2"
              >
                {justCopied ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {justCopied ? '已複製' : '複製到剪貼簿'}
              </Button>
            </div>
          </div>

          {/* Preview pane. The 1080px-wide capture node is scaled down so
              it always fits the available preview area; the actual capture
              uses the un-scaled DOM via the forwarded ref. */}
          <div className="flex-1 overflow-auto bg-muted/40 p-4 flex items-start justify-center">
            <PreviewScaler>
              {isRangeValid && (
                <CalendarExportView
                  ref={exportRef}
                  workspaces={workspaces}
                  timeBlocks={timeBlocks}
                  startDate={startDate}
                  endDate={endDate}
                  startHour={startHour}
                  endHour={endHour}
                  options={options}
                />
              )}
              {!isRangeValid && (
                <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                  日期範圍無效，請重新選擇
                </div>
              )}
            </PreviewScaler>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Measures its container and scales the rendered child (assumed to be the
 * 1080px-wide export view) down to fit. We use ResizeObserver instead of
 * raw window resize because the modal itself is in a flex layout whose
 * available width changes when the sidebar resizes etc.
 */
function PreviewScaler({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [naturalHeight, setNaturalHeight] = useState(0)

  // Observe BOTH the outer container (for width-driven scale) and the
  // inner 1080px-wide content (for height). Earlier the wrapper used a
  // marginBottom of `calc(-100% * (1 - scale))`, which resolved against
  // the parent's *width* rather than the child's *height* — produced
  // either dead space or overlap depending on viewport. Measuring the
  // child's actual height and applying it to the wrapper is the only way
  // to correctly collapse the unused vertical space introduced by
  // `transform: scale(...)`, which doesn't shrink the layout box.
  useEffect(() => {
    const outer = containerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const update = () => {
      const w = outer.clientWidth
      if (w > 0) {
        // Subtract a small gutter so the scaled node doesn't bump the
        // modal's scrollbar.
        setScale(Math.min(1, (w - 4) / 1080))
      }
      setNaturalHeight(inner.offsetHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(outer)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="w-full">
      <div
        style={{
          // Outer wrapper holds the SCALED layout box height so subsequent
          // siblings flow correctly. Width is left to fill the container.
          height: naturalHeight > 0 ? naturalHeight * scale : undefined,
          width: '100%',
          position: 'relative',
        }}
      >
        <div
          ref={innerRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: 1080,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
