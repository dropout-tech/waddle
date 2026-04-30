'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  ChevronDown, ChevronUp, Plus, X, Image, Link2, Type, 
  Trash2, GripVertical, ExternalLink, Calendar, Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScratchpadItem } from '@/lib/types'

interface FocusScratchpadProps {
  className?: string
}

export function FocusScratchpad({ className }: FocusScratchpadProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [items, setItems] = useState<ScratchpadItem[]>([])
  const [inputMode, setInputMode] = useState<'text' | 'image' | 'link' | null>(null)
  const [textInput, setTextInput] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const today = new Date().toLocaleDateString('zh-TW', { 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  })

  // Load items from localStorage
  useEffect(() => {
    const todayKey = new Date().toISOString().split('T')[0]
    const saved = localStorage.getItem(`scratchpad-${todayKey}`)
    if (saved) {
      try {
        setItems(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse scratchpad data')
      }
    }
  }, [])

  // Save items to localStorage
  useEffect(() => {
    const todayKey = new Date().toISOString().split('T')[0]
    localStorage.setItem(`scratchpad-${todayKey}`, JSON.stringify(items))
  }, [items])

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
    <div className={cn('relative z-50', className)}>
      {/* Pull Tab - Always Visible */}
      <div 
        className={cn(
          'absolute left-1/2 -translate-x-1/2 top-0 z-50',
          'transition-all duration-300',
          isExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        <button
          onClick={() => setIsExpanded(true)}
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
          'bg-card/98 backdrop-blur-md border-b border-border shadow-xl',
          'transition-all duration-300 ease-out overflow-hidden',
          isExpanded ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0'
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
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>{today}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  清除全部
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

          {/* Quick Add Buttons */}
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

      {/* Backdrop */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  )
}
