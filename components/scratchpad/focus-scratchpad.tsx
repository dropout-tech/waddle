'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  ChevronDown, ChevronUp, X, Image, Link2, Type, 
  Trash2, ExternalLink, Calendar, Sparkles, ChevronLeft, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { ScratchpadItem } from '@/lib/types'

interface FocusScratchpadProps {
  className?: string
  /**
   * When provided, the component is controlled — internal isExpanded
   * state is ignored. Used by the mobile layout so the bottom tab
   * bar's 白板 button can drive the open state.
   */
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the built-in pull-down trigger (mobile uses an external button). */
  hideTrigger?: boolean
}

// Get all saved scratchpad dates from localStorage
function getSavedDates(): string[] {
  const dates: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('scratchpad-')) {
      const date = key.replace('scratchpad-', '')
      if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dates.push(date)
      }
    }
  }
  return dates.sort().reverse() // Most recent first
}

export function FocusScratchpad({ className, isOpen, onOpenChange, hideTrigger }: FocusScratchpadProps) {
  const todayKey = toDateString(new Date())
  const [internalExpanded, setInternalExpanded] = useState(false)
  // Controlled when isOpen is provided; otherwise fall back to internal state.
  const isControlled = isOpen !== undefined
  const isExpanded = isControlled ? !!isOpen : internalExpanded
  const setIsExpanded = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next)
    } else {
      setInternalExpanded(next)
    }
  }
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [items, setItems] = useState<ScratchpadItem[]>([])
  const [savedDates, setSavedDates] = useState<string[]>([])
  const [inputMode, setInputMode] = useState<'text' | 'image' | 'link' | null>(null)
  const [textInput, setTextInput] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const isToday = selectedDate === todayKey

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const date = new Date(year, month - 1, day)
    const weekday = weekdays[date.getDay()]
    return `${year}年${month}月${day}日 星期${weekday}`
  }

  // Load saved dates list
  useEffect(() => {
    setSavedDates(getSavedDates())
  }, [isExpanded])

  // Load items for selected date
  useEffect(() => {
    const saved = localStorage.getItem(`scratchpad-${selectedDate}`)
    if (saved) {
      try {
        setItems(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse scratchpad data')
        setItems([])
      }
    } else {
      setItems([])
    }
  }, [selectedDate])

  // Save items to localStorage (only for today)
  useEffect(() => {
    if (isToday && items.length > 0) {
      localStorage.setItem(`scratchpad-${todayKey}`, JSON.stringify(items))
      // Update saved dates if needed
      if (!savedDates.includes(todayKey)) {
        setSavedDates(prev => [todayKey, ...prev])
      }
    }
  }, [items, isToday, todayKey, savedDates])

  // Navigate between dates
  const goToPreviousDate = () => {
    const currentIndex = savedDates.indexOf(selectedDate)
    if (currentIndex < savedDates.length - 1) {
      setSelectedDate(savedDates[currentIndex + 1])
    }
  }

  const goToNextDate = () => {
    const currentIndex = savedDates.indexOf(selectedDate)
    if (currentIndex > 0) {
      setSelectedDate(savedDates[currentIndex - 1])
    } else if (selectedDate !== todayKey) {
      setSelectedDate(todayKey)
    }
  }

  const canGoPrevious = savedDates.indexOf(selectedDate) < savedDates.length - 1
  const canGoNext = selectedDate !== todayKey

  // Focus textarea when text mode is activated
  useEffect(() => {
    if (inputMode === 'text' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [inputMode])

  const addTextItem = () => {
    if (!textInput.trim()) return
    const newItem: ScratchpadItem = {
      id: crypto.randomUUID(),
      type: 'text',
      content: textInput.trim(),
      createdAt: new Date().toISOString(),
    }
    setItems(prev => [newItem, ...prev])
    setTextInput('')
    setInputMode(null)
  }

  const addLinkItem = () => {
    if (!linkInput.trim()) return
    let url = linkInput.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    const newItem: ScratchpadItem = {
      id: crypto.randomUUID(),
      type: 'link',
      content: url,
      title: linkTitle.trim() || url,
      createdAt: new Date().toISOString(),
    }
    setItems(prev => [newItem, ...prev])
    setLinkInput('')
    setLinkTitle('')
    setInputMode(null)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('圖片大小不能超過 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        const newItem: ScratchpadItem = {
          id: crypto.randomUUID(),
          type: 'image',
          content: reader.result as string,
          createdAt: new Date().toISOString(),
        }
        setItems(prev => [newItem, ...prev])
        setInputMode(null)
      }
      reader.readAsDataURL(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items_data = e.clipboardData.items
    for (const item of items_data) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onloadend = () => {
            const newItem: ScratchpadItem = {
              id: crypto.randomUUID(),
              type: 'image',
              content: reader.result as string,
              createdAt: new Date().toISOString(),
            }
            setItems(prev => [newItem, ...prev])
          }
          reader.readAsDataURL(file)
        }
        return
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const file = files[0]
      if (file.size > 5 * 1024 * 1024) {
        alert('圖片大小不能超過 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        const newItem: ScratchpadItem = {
          id: crypto.randomUUID(),
          type: 'image',
          content: reader.result as string,
          createdAt: new Date().toISOString(),
        }
        setItems(prev => [newItem, ...prev])
      }
      reader.readAsDataURL(file)
    }
  }

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const clearAll = () => {
    if (confirm('確定要清除所有暫存內容嗎？')) {
      setItems([])
    }
  }

  return (
    <>
      {/* Backdrop - render first so it's behind */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[60]"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div className={cn('relative z-[70]', className)}>
        {/* Pull Tab - hidden when controlled by parent (mobile bottom tab) */}
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 top-0',
            'transition-all duration-300',
            isExpanded || hideTrigger ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}
        >
          <button
            data-tour="scratchpad"
            onClick={() => { setIsExpanded(true); setSelectedDate(todayKey) }}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-b-xl',
              'bg-card/95 backdrop-blur-sm border border-t-0 border-border shadow-lg',
              'hover:bg-secondary/80 transition-all group',
              'text-xs font-medium text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="w-3 h-3" />
            <span>專注白板</span>
            {items.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                {items.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* Expanded Panel */}
        <div
          ref={panelRef}
          className={cn(
            'absolute left-0 right-0 top-0',
            'bg-card border-b border-border shadow-xl',
            'transition-all duration-300 ease-out overflow-hidden',
            isExpanded ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          )}
          onPaste={handlePaste}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary/50 z-50 flex items-center justify-center">
            <div className="text-primary font-medium">放開以新增圖片</div>
          </div>
        )}

        <div className="max-w-4xl mx-auto p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">專注白板</h2>
                {/* Date Navigation */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <button
                    onClick={goToPreviousDate}
                    disabled={!canGoPrevious}
                    className="p-0.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(selectedDate)}</span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                        今天
                      </span>
                    )}
                  </div>
                  <button
                    onClick={goToNextDate}
                    disabled={!canGoNext}
                    className="p-0.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {items.length > 0 && isToday && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  清除
                </button>
              )}
              <button
                onClick={() => setIsExpanded(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-xs font-medium transition-colors"
              >
                <ChevronUp className="w-3 h-3" />
                收起
              </button>
            </div>
          </div>

          {/* Quick Add Buttons - Only show for today */}
          {isToday ? (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setInputMode(inputMode === 'text' ? null : 'text')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm',
                  inputMode === 'text'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground'
                )}
              >
                <Type className="w-4 h-4" />
                <span>文字</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground"
              >
                <Image className="w-4 h-4" />
                <span>圖片</span>
              </button>
              <button
                onClick={() => setInputMode(inputMode === 'link' ? null : 'link')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm',
                  inputMode === 'link'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground'
                )}
              >
                <Link2 className="w-4 h-4" />
                <span>連結</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              <div className="flex-1" />
              <span className="text-[10px] text-muted-foreground">
                提示：可直接貼上圖片或拖放檔案
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-secondary/30 border border-border">
              <span className="text-xs text-muted-foreground">這是過去日期的記錄，僅供查看</span>
              <button
                onClick={() => setSelectedDate(todayKey)}
                className="text-xs text-primary hover:underline"
              >
                返回今天
              </button>
            </div>
          )}

          {/* Text Input */}
          {inputMode === 'text' && (
            <div className="mb-4 p-3 rounded-xl bg-secondary/50 border border-border">
              <textarea
                ref={textareaRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    addTextItem()
                  }
                }}
                placeholder="記下你的想法... (Ctrl+Enter 儲存)"
                className="w-full bg-transparent border-0 resize-none text-sm placeholder:text-muted-foreground focus:outline-none min-h-[60px]"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => { setTextInput(''); setInputMode(null) }}
                  className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={addTextItem}
                  disabled={!textInput.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  儲存
                </button>
              </div>
            </div>
          )}

          {/* Link Input */}
          {inputMode === 'link' && (
            <div className="mb-4 p-3 rounded-xl bg-secondary/50 border border-border space-y-2">
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="輸入網址..."
                className="w-full bg-transparent border-0 text-sm placeholder:text-muted-foreground focus:outline-none"
                autoFocus
              />
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="標題（可選）"
                className="w-full bg-transparent border-0 text-xs placeholder:text-muted-foreground focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addLinkItem()
                  }
                }}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => { setLinkInput(''); setLinkTitle(''); setInputMode(null) }}
                  className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={addLinkItem}
                  disabled={!linkInput.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  新增
                </button>
              </div>
            </div>
          )}

          {/* Items Grid */}
          {items.length === 0 ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">專注白板是空的</p>
              <p className="text-xs text-muted-foreground/70">在這裡記錄分心的想法，讓你專注於當前任務</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[40vh] overflow-y-auto pb-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group relative rounded-xl border border-border bg-background/50 hover:bg-background hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Delete Button */}
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="absolute top-2 right-2 z-10 p-1 rounded-lg bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  {item.type === 'text' && (
                    <div className="p-3">
                      <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap">{item.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {new Date(item.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}

                  {item.type === 'image' && (
                    <div>
                      <img 
                        src={item.content} 
                        alt="scratchpad image" 
                        className="w-full h-32 object-cover"
                      />
                      <p className="text-[10px] text-muted-foreground p-2">
                        {new Date(item.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}

                  {item.type === 'link' && (
                    <a
                      href={item.content}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 hover:bg-primary/5 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Link2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground line-clamp-2">{item.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.content}</p>
                        </div>
                        <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      </div>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close Handle at Bottom */}
        <div className="flex justify-center pb-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
    </>
  )
}
