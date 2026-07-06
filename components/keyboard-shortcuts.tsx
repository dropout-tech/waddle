'use client'

import { useEffect, useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

interface ShortcutGroup {
  title: string
  items: { keys: string[]; label: string }[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: '日曆導航',
    items: [
      { keys: ['←', '→'], label: '上一日 / 下一日' },
      { keys: ['T'], label: '回到今天' },
      { keys: ['D'], label: '日檢視' },
      { keys: ['W'], label: '週檢視' },
      { keys: ['M'], label: '月檢視' },
    ],
  },
  {
    title: '面板',
    items: [
      { keys: ['←', '→'], label: '聚焦面板分隔線後微調寬度（每次 16px）' },
    ],
  },
  {
    title: '任務',
    items: [
      { keys: ['點擊'], label: '開啟任務詳情' },
      { keys: ['Enter', 'Space'], label: '在聚焦的任務塊上開啟詳情' },
      { keys: ['拖拉'], label: '改變任務的時段或日期' },
    ],
  },
  {
    title: '備註編輯',
    items: [
      { keys: ['Enter'], label: '在 bullet/checklist 行上自動延續標記' },
      { keys: ['點擊'], label: '在 ☐ 旁切換成 ☑（再點切回）' },
      { keys: ['⌘', 'Enter'], label: '在備註內快速送出' },
    ],
  },
  {
    title: '一般',
    items: [
      { keys: ['?'], label: '顯示這份快捷鍵清單' },
      { keys: ['Esc'], label: '關閉視窗 / 取消輸入' },
    ],
  },
]

export function KeyboardShortcutsHint() {
  const isMobile = useIsMobile()
  // Phones don't have keyboards; the hint is irrelevant noise on mobile.
  if (isMobile) return null
  return <KeyboardShortcutsHintInner />
}

function KeyboardShortcutsHintInner() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing
      const target = e.target as HTMLElement
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setIsOpen((v) => !v)
        return
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="鍵盤快捷鍵"
        title="鍵盤快捷鍵 (?)"
        className="fixed bottom-4 left-4 z-40 w-8 h-8 rounded-full bg-card/80 backdrop-blur border border-border shadow-sm flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-card hover:scale-110 transition-all opacity-50 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100"
      >
        <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="鍵盤快捷鍵"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">鍵盤快捷鍵</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="關閉"
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-foreground/85 flex-1 min-w-0">{item.label}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {item.keys.map((k, ki) => (
                        <Kbd key={ki}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 border-t border-border bg-secondary/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            隨時按 <Kbd inline>?</Kbd> 重新打開這份清單
          </span>
          <span className="text-[10px] text-muted-foreground">
            按 <Kbd inline>Esc</Kbd> 關閉
          </span>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border bg-background font-mono shadow-sm',
        inline
          ? 'min-w-5 h-5 px-1.5 text-[10px] text-muted-foreground'
          : 'min-w-7 h-6 px-1.5 text-[11px] text-foreground'
      )}
    >
      {children}
    </kbd>
  )
}
