'use client'

import { useState, useRef } from 'react'
import { 
  X, Trash2, Archive, Check, Upload, ImageIcon,
  Star, Heart, Flame, Zap, BookOpen, Music, Globe, Target,
  Lightbulb, Rocket, Leaf, Gem, Trophy, Palette, FileText, Settings,
  Home, Briefcase, Code, Coffee, Camera, Gift, Calendar, Users,
  Folder, Mail, Phone, ShoppingBag, Plane, Car, Gamepad2, Headphones
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'

const PRESET_COLORS = [
  '#c9847a', '#8fae8b', '#a8927f', '#7da2b8', '#c4a4b5', '#d4a76a',
  '#e07b5a', '#6b9e78', '#9b7cb6', '#5b9ec9', '#d4845a', '#7aad9e',
  '#b07bb5', '#c4a95a', '#7a9ec9', '#d47a8b',
]

// Map icon names to Lucide components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  star: Star, heart: Heart, flame: Flame, zap: Zap,
  book: BookOpen, music: Music, globe: Globe, target: Target,
  lightbulb: Lightbulb, rocket: Rocket, leaf: Leaf, gem: Gem,
  trophy: Trophy, palette: Palette, file: FileText, settings: Settings,
  home: Home, briefcase: Briefcase, code: Code, coffee: Coffee,
  camera: Camera, gift: Gift, calendar: Calendar, users: Users,
  folder: Folder, mail: Mail, phone: Phone, shopping: ShoppingBag,
  plane: Plane, car: Car, gamepad: Gamepad2, headphones: Headphones,
}

const PRESET_ICONS = Object.keys(ICON_MAP)

interface WorkspaceSettingsModalProps {
  workspace: Workspace
  isOpen: boolean
  onClose: () => void
  onUpdate: (workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>) => void
  onArchive?: (workspaceId: string) => void
  onDelete?: (workspaceId: string) => void
}

export function WorkspaceSettingsModal({
  workspace,
  isOpen,
  onClose,
  onUpdate,
  onArchive,
  onDelete,
}: WorkspaceSettingsModalProps) {
  const [name, setName] = useState(workspace.name)
  const [color, setColor] = useState(workspace.color)
  const [icon, setIcon] = useState(workspace.icon)
  const [customImage, setCustomImage] = useState<string | null>(
    workspace.icon?.startsWith('data:') || workspace.icon?.startsWith('http') ? workspace.icon : null
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('圖片大小不能超過 2MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setCustomImage(result)
        setIcon(result)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearCustomImage = () => {
    setCustomImage(null)
    setIcon('star')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (!isOpen) return null

  const hasChanges =
    name !== workspace.name || color !== workspace.color || icon !== workspace.icon

  // Helper to render icon (either Lucide or custom image)
  const renderIcon = (iconValue: string | undefined, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClasses = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' }
    
    if (!iconValue) return null
    
    // Check if it's a custom image (data URL or http URL)
    if (iconValue.startsWith('data:') || iconValue.startsWith('http')) {
      return (
        <img 
          src={iconValue} 
          alt="custom icon" 
          className={cn(sizeClasses[size], 'rounded object-cover')}
        />
      )
    }
    
    // Otherwise render Lucide icon
    const IconComponent = ICON_MAP[iconValue]
    if (IconComponent) {
      return <IconComponent className={sizeClasses[size]} />
    }
    
    return null
  }

  const handleSave = () => {
    if (!name.trim()) return
    onUpdate(workspace.id, { name: name.trim(), color, icon })
    onClose()
  }

  const taskCount = workspace.categories.reduce(
    (sum, cat) => sum + cat.tasks.filter((t) => !t.isCompleted).length,
    0
  )
  const totalTasks = workspace.categories.reduce((sum, cat) => sum + cat.tasks.length, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm mx-4 overflow-hidden flex flex-col max-h-[90dvh]">

        {/* Color accent top bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: `${color}15`, border: `1.5px solid ${color}30`, color }}
            >
              {icon ? renderIcon(icon, 'lg') : <span className="text-sm font-bold">{name.charAt(0)}</span>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">工作區設定</p>
              <p className="text-sm font-semibold text-foreground leading-tight">{workspace.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label="關閉"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1 min-h-0">

          {/* Stats */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{taskCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">待完成</p>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{totalTasks}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">全部任務</p>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{workspace.categories.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">分類數</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              名稱
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              placeholder="工作區名稱..."
            />
          </div>

          {/* Icon */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              圖示
            </label>
            
            {/* Custom Image Upload */}
            <div className="mb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              {customImage ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-border flex-shrink-0">
                    <img src={customImage} alt="custom" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">自訂圖片</p>
                    <p className="text-xs text-muted-foreground">已上傳</p>
                  </div>
                  <button
                    onClick={clearCustomImage}
                    className="p-2 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/10 transition-colors">
                    <Upload className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">上傳自訂圖片</p>
                    <p className="text-xs text-muted-foreground">支援 JPG、PNG，最大 2MB</p>
                  </div>
                </button>
              )}
            </div>
            
            {/* Divider */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">或選擇圖示</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            
            {/* Preset Icons Grid */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ICONS.map((iconName) => {
                const IconComponent = ICON_MAP[iconName]
                const isSelected = icon === iconName && !customImage
                return (
                  <button
                    key={iconName}
                    onClick={() => {
                      setIcon(iconName)
                      setCustomImage(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className={cn(
                      'w-9 h-9 rounded-xl border flex items-center justify-center transition-all hover:scale-105',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary scale-105'
                        : 'border-border hover:border-primary/40 bg-muted/30 text-muted-foreground hover:text-foreground'
                    )}
                    title={iconName}
                  >
                    <IconComponent className="w-4 h-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              顏色
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                >
                  {color === c && <Check className="w-3 h-3 text-white drop-shadow" strokeWidth={3} />}
                </button>
              ))}
            </div>
            {/* Custom color picker */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">自訂顏色</span>
              <div className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border border-border opacity-0 absolute inset-0"
                />
                <div
                  className="w-7 h-7 rounded-full border-2 border-border cursor-pointer flex items-center justify-center text-[10px] font-mono text-white/70 overflow-hidden"
                  style={{ backgroundColor: color }}
                >
                  #
                </div>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">{color}</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 space-y-3 border-t border-border bg-card flex-shrink-0">
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!name.trim() || !hasChanges}
            className={cn(
              'w-full py-2.5 rounded-xl text-sm font-semibold transition-all',
              hasChanges && name.trim()
                ? 'text-white shadow-sm hover:brightness-110'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
            style={hasChanges && name.trim() ? { backgroundColor: color } : {}}
          >
            儲存變更
          </button>

          {/* Danger zone */}
          <div className="flex gap-2">
            {onArchive && (
              <button
                onClick={() => { onArchive(workspace.id); onClose() }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                封存
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  if (confirmDelete) {
                    onDelete(workspace.id)
                    onClose()
                  } else {
                    setConfirmDelete(true)
                    setTimeout(() => setConfirmDelete(false), 3000)
                  }
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all',
                  confirmDelete
                    ? 'border-red-400 bg-red-50 text-red-600 dark:bg-red-950/30'
                    : 'border-border text-muted-foreground hover:border-red-300 hover:text-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20'
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDelete ? '確認刪除' : '刪除'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
