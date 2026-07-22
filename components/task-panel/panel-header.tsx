'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { Sun, Plus, X, Settings2, PanelLeftClose, Maximize2, Minimize2, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Workspace } from '@/lib/types'
import { WorkspaceSettingsModal } from '@/components/modals/workspace-settings-modal'
import { WorkspaceIcon, PRESET_ICONS, PRESET_ICON_NAMES } from '@/lib/workspace-icons'
import { UserMenu } from '@/components/user-menu'
import { useDisplayColor } from '@/hooks/use-display-color'
import { hapticSelection } from '@/lib/haptics'
import { useI18n } from '@/lib/i18n/react'
import {
  DEFAULT_MASCOT_SRC,
  getMascotSurprise,
  type MascotSurprise,
} from '@/lib/mascot-surprises'

// Pet-the-mascot easter egg — small talk, not a feature. About a third of
// pets get an extra line (kept quiet the rest of the time so it stays a
// surprise rather than a canned response), throttled to one toast per
// 1.5s so rapid clicking can't spam the toast stack.
const PET_MESSAGES = [
  '嘎。',
  '今天也慢慢來就好。',
  '謝謝你摸我。',
  '記得喝口水。',
]
const PET_TOAST_CHANCE = 1 / 3
const PET_TOAST_THROTTLE_MS = 1500
const PET_SURPRISE_MS = 1700
const HEADER_MODE_STORAGE_KEY = 'waddle-header-mode'
const HEADER_MODE_CHANGE_EVENT = 'waddle-header-mode-change'
const HEADER_MESSAGE_STORAGE_KEY = 'huddle-header-message'
const HEADER_MESSAGES = [
  '記下今天，看見自己的節奏',
  '把今天，整理成明天的線索',
  '留下紀錄，讓回顧更有方向',
  '安排眼前，也記得長期的自己',
  '今天的步調，由你來決定',
  '每一天，都在累積自己的方法',
] as const

type HeaderMode = 'full' | 'compact' | 'minimal'

function getHeaderModeSnapshot(): HeaderMode {
  const savedMode = localStorage.getItem(HEADER_MODE_STORAGE_KEY)
  if (savedMode === 'full' || savedMode === 'compact' || savedMode === 'minimal') {
    return savedMode
  }
  return localStorage.getItem('waddle-header-collapsed') === 'true' ? 'compact' : 'full'
}

function subscribeHeaderMode(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === HEADER_MODE_STORAGE_KEY ||
      event.key === 'waddle-header-collapsed'
    ) {
      onChange()
    }
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(HEADER_MODE_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(HEADER_MODE_CHANGE_EVENT, onChange)
  }
}

interface PanelHeaderProps {
  workspaces: Workspace[]
  isExpanded?: boolean
  onWorkspaceClick: (workspaceId: string) => void
  onAddWorkspace?: (name: string, color: string, icon: string) => void
  onUpdateWorkspaceColor?: (workspaceId: string, color: string) => void
  onUpdateWorkspace?: (workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onClosePanel?: () => void
  onToggleExpand?: () => void
}

const PRESET_COLORS = [
  '#c9847a', '#8fae8b', '#a8927f', '#7da2b8', '#c4a4b5', '#d4a76a',
]

export function PanelHeader({
  workspaces,
  isExpanded = false,
  onWorkspaceClick,
  onAddWorkspace,
  onUpdateWorkspaceColor,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onArchiveWorkspace,
  onClosePanel,
  onToggleExpand,
}: PanelHeaderProps) {
  const { t, lang } = useI18n()
  const isMobile = useIsMobile()
  const displayColor = useDisplayColor()
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null)
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null)
  const settingsWorkspace = workspaces.find((w) => w.id === settingsWorkspaceId) ?? null
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])
  const [selectedIcon, setSelectedIcon] = useState(PRESET_ICON_NAMES[0])
  const today = new Date()

  // Pet-the-mascot easter egg. petBobToken starts at 0 = idle (no
  // animation class applied, so it never auto-plays on mount); each click
  // bumps it to a new value, which both (a) turns the animation class on
  // and (b) remounts the wrapping <span> via `key`, so the one-shot
  // huddle-pet CSS animation restarts cleanly even if the previous motion
  // hasn't finished yet. lastPetToastAtRef throttles the
  // occasional extra toast line — a ref (not state) because it's read/
  // written inside the click handler and never needs to trigger a render.
  const [petBobToken, setPetBobToken] = useState(0)
  const [petSurprise, setPetSurprise] = useState<MascotSurprise | null>(null)
  const lastPetToastAtRef = useRef(0)
  const petSurpriseCursorRef = useRef(0)
  const petSurpriseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePetMascot = () => {
    setPetBobToken((t) => t + 1)
    petSurpriseCursorRef.current += 1
    const surprise = getMascotSurprise(petSurpriseCursorRef.current)
    setPetSurprise(surprise)
    hapticSelection()

    if (petSurpriseTimerRef.current) clearTimeout(petSurpriseTimerRef.current)
    petSurpriseTimerRef.current = setTimeout(() => setPetSurprise(null), PET_SURPRISE_MS)

    if (Math.random() >= PET_TOAST_CHANCE) return
    const now = Date.now()
    if (now - lastPetToastAtRef.current < PET_TOAST_THROTTLE_MS) return
    lastPetToastAtRef.current = now
    toast(t(Math.random() < 0.55
      ? surprise.message
      : PET_MESSAGES[Math.floor(Math.random() * PET_MESSAGES.length)]))
  }

  useEffect(() => () => {
    if (petSurpriseTimerRef.current) clearTimeout(petSurpriseTimerRef.current)
  }, [])

  // Three header densities, persisted locally. The legacy boolean is retained
  // as a fallback so existing compact-header preferences migrate seamlessly.
  const headerMode = useSyncExternalStore(
    subscribeHeaderMode,
    getHeaderModeSnapshot,
    () => 'full'
  )
  const [headerMessage, setHeaderMessage] = useState<string>(HEADER_MESSAGES[0])

  // Pick a new thought whenever the panel mounts. Remember the previous one so
  // consecutive visits never show the same line, while keeping the first
  // server/client render deterministic for hydration.
  useEffect(() => {
    const previousMessage = localStorage.getItem(HEADER_MESSAGE_STORAGE_KEY)
    const candidates = HEADER_MESSAGES.filter((message) => message !== previousMessage)
    const nextMessage = candidates[Math.floor(Math.random() * candidates.length)] ?? HEADER_MESSAGES[0]

    localStorage.setItem(HEADER_MESSAGE_STORAGE_KEY, nextMessage)
    const frame = requestAnimationFrame(() => setHeaderMessage(nextMessage))
    return () => cancelAnimationFrame(frame)
  }, [])

  const changeHeaderMode = (mode: HeaderMode) => {
    localStorage.setItem(HEADER_MODE_STORAGE_KEY, mode)
    localStorage.setItem('waddle-header-collapsed', String(mode !== 'full'))
    window.dispatchEvent(new Event(HEADER_MODE_CHANGE_EVENT))
  }

  // Count pending tasks per workspace. Tasks marked 加入左側任務欄 = false
  // (calendar-only) are excluded so the badge matches the rendered list.
  const getWorkspaceCount = (workspace: Workspace) => {
    let count = 0
    for (const category of workspace.categories) {
      count += category.tasks.filter(
        (t) =>
          !t.isCompleted &&
          t.showInTaskList !== false &&
          !(t.isMeeting && t.scheduledDate)
      ).length
    }
    return count
  }

  // Get total pending tasks
  const totalPending = workspaces.reduce((sum, ws) => sum + getWorkspaceCount(ws), 0)

  const handleAddWorkspace = () => {
    if (newName.trim() && onAddWorkspace) {
      onAddWorkspace(newName.trim(), selectedColor, selectedIcon)
      setNewName('')
      setSelectedColor(PRESET_COLORS[0])
      setSelectedIcon(PRESET_ICON_NAMES[0])
      setIsAdding(false)
    }
  }

  return (
    // Desktop reserves right space for the floating UserMenu avatar.
    // Mobile renders UserMenu inline (in MainLayout's mobile branch) so the
    // header can use balanced padding here.
    <div className={cn(
      'relative border-b border-border bg-card transition-[padding] duration-200',
      headerMode === 'minimal' ? 'py-2' : 'py-4',
      isMobile ? 'px-4' : 'pl-5 pr-14'
    )}>
      {/* Minimal Mode - smallest useful row; panel controls stay reachable. */}
      {headerMode === 'minimal' ? (
        <div className="flex min-h-8 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
              <span className="text-sm font-bold text-primary tabular-nums">
                {today.getDate()}
              </span>
            </div>
            <span className="truncate text-xs font-semibold text-foreground">
              {t('{count} 待辦', { count: totalPending })}
            </span>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => changeHeaderMode('compact')}
              className="rounded-md p-1.5 transition-colors hover:bg-secondary"
              title={t('展開成精簡列')}
              aria-label={t('展開成精簡列')}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  isExpanded
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'text-muted-foreground hover:bg-secondary'
                )}
                title={isExpanded ? t('顯示日曆') : t('展開任務面板')}
                aria-label={isExpanded ? t('顯示日曆') : t('展開任務面板')}
              >
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            )}
            {isMobile && <UserMenu className="relative ml-1" />}
            {onClosePanel && !isExpanded && (
              <button
                type="button"
                onClick={onClosePanel}
                className="rounded-md p-1.5 transition-colors hover:bg-secondary"
                title={t('收起面板')}
                aria-label={t('收起面板')}
              >
                <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      ) : headerMode === 'compact' ? (
        /* Compact Mode - date summary with controls for both directions. */
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Compact date */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-base font-bold text-primary tabular-nums">
                  {today.getDate()}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {today.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'short' })}
                </span>
                <span className="text-[10px] text-muted-foreground -mt-0.5">
                  {today.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { weekday: 'short' })}
                </span>
              </div>
            </div>
            {/* Pending count */}
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-primary/10 text-primary">
              {t('{count} 待辦', { count: totalPending })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Collapse one more level */}
            <button
              type="button"
              onClick={() => changeHeaderMode('minimal')}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
              title={t('收合成最小列')}
              aria-label={t('收合成最小列')}
            >
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </button>
            {/* Expand to the full header */}
            <button
              type="button"
              onClick={() => changeHeaderMode('full')}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
              title={t('展開完整標題列')}
              aria-label={t('展開完整標題列')}
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
            {/* Expand/Collapse Right Panel Button */}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  isExpanded
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "hover:bg-secondary text-muted-foreground"
                )}
                title={isExpanded ? t('顯示日曆') : t('展開任務面板')}
                aria-label={isExpanded ? t('顯示日曆') : t('展開任務面板')}
              >
                {isExpanded ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}
            {/* Inline UserMenu on mobile (collapsed header) */}
            {isMobile && <UserMenu className="relative ml-1" />}
            {/* Close Panel Button */}
            {onClosePanel && !isExpanded && (
              <button
                type="button"
                onClick={onClosePanel}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                title={t('收起面板')}
                aria-label={t('收起面板')}
              >
                <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Expanded Mode - Full header */
        <>
          {/* Row 1: Brand + Weather */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handlePetMascot}
                  aria-label={t('摸摸企鵝')}
                  className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    key={`${petBobToken}-${petSurprise?.id ?? 'default'}`}
                    className={cn('block', petBobToken > 0 && 'animate-huddle-pet')}
                  >
                    <span className="block h-9 w-9 overflow-hidden rounded-lg bg-[#f4d977]">
                      <Image
                        src={petSurprise?.src ?? DEFAULT_MASCOT_SRC}
                        alt=""
                        width={36}
                        height={36}
                        aria-hidden="true"
                        className="h-full w-full object-contain"
                        style={petSurprise?.id === 'pixel' ? { imageRendering: 'pixelated' } : undefined}
                        priority
                      />
                    </span>
                  </span>
                </button>
                <div>
                  <h1 className="text-lg font-bold text-foreground tracking-tight">
                    Huddle
                  </h1>
                  <p className="text-[10px] text-muted-foreground -mt-0.5">
                    {t(headerMessage)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Weather Widget - Minimal */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border">
                <Sun className="w-3.5 h-3.5 text-urgency-medium" />
                <span className="text-xs font-medium text-foreground">26°</span>
              </div>

              {/* Collapse header button */}
              <button
                type="button"
                onClick={() => changeHeaderMode('compact')}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                title={t('收合成精簡列')}
                aria-label={t('收合成精簡列')}
              >
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              </button>

              {/* Expand/Collapse Right Panel Button */}
              {onToggleExpand && (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isExpanded
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "hover:bg-secondary text-muted-foreground"
                  )}
                  title={isExpanded ? t('顯示日曆') : t('展開任務面板')}
                  aria-label={isExpanded ? t('顯示日曆') : t('展開任務面板')}
                >
                  {isExpanded ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Close Panel Button */}
              {onClosePanel && !isExpanded && (
                <button
                  type="button"
                  onClick={onClosePanel}
                  className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                  title={t('收起面板')}
                  aria-label={t('收起面板')}
                >
                  <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {/* Inline UserMenu on mobile (replaces the floating one) */}
              {isMobile && <UserMenu className="relative ml-1" />}
            </div>
          </div>

          {/* Date Display */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Day number */}
              <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex-shrink-0">
                <span className="text-xl font-bold leading-none text-primary tabular-nums">
                  {today.getDate()}
                </span>
              </div>
              {/* Month / Year / Weekday */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {today.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'long' })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {today.getFullYear()}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {today.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { weekday: 'long' })}
                </span>
              </div>
            </div>
            <span className="stamp text-primary border-primary">
              {t('{count} 待辦', { count: totalPending })}
            </span>
          </div>

          {/* Workspace Badges. Mobile: horizontal scroll on a single row so
              they don't wrap into messy multi-line clusters. Desktop: wrap. */}
          <div
            className={cn(
              'flex items-center gap-2',
              isMobile ? 'overflow-x-auto -mx-4 px-4 pb-1' : 'flex-wrap'
            )}
            style={isMobile ? { scrollbarWidth: 'none', msOverflowStyle: 'none' } : undefined}
          >
            {workspaces
              .filter((w) => !w.isArchived)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((workspace) => {
                const count = getWorkspaceCount(workspace)
                const wsColor = displayColor(workspace.color)
                return (
                  <button
                    key={workspace.id}
                    onClick={() => onWorkspaceClick(workspace.id)}
                    className={cn(
                      'group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0',
                      'border bg-card hover:bg-muted/50'
                    )}
                    style={{ borderColor: `${wsColor}40`, color: wsColor }}
                  >
                    <WorkspaceIcon
                      icon={workspace.icon}
                      fallback={workspace.name}
                      color={wsColor}
                      size="xs"
                    />
                    <span className="font-semibold">{workspace.name}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ backgroundColor: `${wsColor}18` }}
                    >
                      {count}
                    </span>
                    
                    {/* Settings icon - appears on hover */}
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        setSettingsWorkspaceId(workspace.id)
                      }}
                      className="ml-0.5 p-0.5 rounded opacity-40 hover:opacity-100 hover:bg-muted/60 transition-all cursor-pointer"
                    >
                      <Settings2 className="w-3 h-3" />
                    </span>
                  </button>
                )
              })}

        {/* Add Workspace Button */}
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all flex-shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>{t('新增')}</span>
            </button>
          </div>
        </>
      )}

      {/* Workspace Settings Modal */}
      {settingsWorkspace && (
        <WorkspaceSettingsModal
          workspace={settingsWorkspace}
          isOpen={!!settingsWorkspaceId}
          onClose={() => setSettingsWorkspaceId(null)}
          onUpdate={(id, updates) => {
            onUpdateWorkspace?.(id, updates)
            if (updates.color) onUpdateWorkspaceColor?.(id, updates.color)
          }}
          onDelete={onDeleteWorkspace}
          onArchive={onArchiveWorkspace}
        />
      )}

      {/* Add Workspace Modal */}
      {isAdding && (
        <div className="absolute inset-x-0 top-full mt-2 mx-4 p-4 bg-card border border-border rounded-xl shadow-lg z-modal">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">{t('新增工作區')}</span>
            <button
              onClick={() => setIsAdding(false)}
              className="p-1 rounded hover:bg-secondary"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddWorkspace()
              else if (e.key === 'Escape') setIsAdding(false)
            }}
            placeholder={t('工作區名稱...')}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />

          {/* Color Picker */}
          <div className="mb-3">
            <span className="text-xs text-muted-foreground mb-1.5 block">{t('顏色')}</span>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-all',
                    selectedColor === color && 'ring-2 ring-offset-2 ring-primary'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Icon Picker */}
          <div className="mb-4">
            <span className="text-xs text-muted-foreground mb-1.5 block">{t('圖示')}</span>
            <div className="flex gap-2 flex-wrap">
              {PRESET_ICONS.map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setSelectedIcon(value)}
                  title={t(label)}
                  className={cn(
                    'w-8 h-8 rounded-lg border flex items-center justify-center text-base transition-all',
                    selectedIcon === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {value || <span className="text-muted-foreground text-xs">{t('無')}</span>}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAddWorkspace}
            disabled={!newName.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {t('建立工作區')}
          </button>
        </div>
      )}
    </div>
  )
}
