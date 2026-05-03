'use client'

import { useState } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Check,
  Save,
  Plus,
  Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/task-utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Task, JournalEntry } from '@/lib/types'
import { Button } from '@/components/ui/button'

interface JournalModalProps {
  isOpen: boolean
  date: Date
  tasksForDate: Task[]
  entry?: JournalEntry
  onClose: () => void
  onSave: (entry: Partial<JournalEntry>) => void
  onDateChange: (date: Date) => void
}

const moods = [
  { value: 'great', label: '超棒', icon: '✨' },
  { value: 'good', label: '不錯', icon: '😊' },
  { value: 'neutral', label: '普通', icon: '😐' },
  { value: 'bad', label: '不好', icon: '😔' },
  { value: 'terrible', label: '很差', icon: '😫' },
] as const

export function JournalModal({
  isOpen,
  date,
  tasksForDate,
  entry,
  onClose,
  onSave,
  onDateChange,
}: JournalModalProps) {
  const [mood, setMood] = useState<JournalEntry['mood']>(entry?.mood)
  const [content, setContent] = useState(entry?.content || '')

  if (!isOpen) return null

  const completedTasks = tasksForDate.filter((t) => t.isCompleted)
  const incompleteTasks = tasksForDate.filter((t) => !t.isCompleted)

  const handlePrevDay = () => {
    const newDate = new Date(date)
    newDate.setDate(newDate.getDate() - 1)
    onDateChange(newDate)
  }

  const handleNextDay = () => {
    const newDate = new Date(date)
    newDate.setDate(newDate.getDate() + 1)
    onDateChange(newDate)
  }

  const handleSave = () => {
    onSave({
      date: toDateString(date),
      mood,
      content: content || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — full-screen sheet on mobile, centered card on desktop */}
      <div className="relative w-full h-[100dvh] flex flex-col bg-card overflow-hidden animate-in fade-in duration-200 md:h-auto md:max-h-[90vh] md:max-w-xl md:mx-4 md:rounded-2xl md:shadow-2xl md:border md:border-border md:zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">
              {formatDate(date)} 日記
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePrevDay}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNextDay}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors ml-2"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Mood Selector */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              今天的心情
            </label>
            <div className="flex items-center gap-2">
              {moods.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMood(m.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl border transition-all',
                    mood === m.value
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Task Review */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              今日任務回顧
            </label>
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2">
              {tasksForDate.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  今天沒有排定任務
                </p>
              ) : (
                <>
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-3 h-3 text-emerald-500" />
                      </div>
                      <span className="text-muted-foreground line-through">
                        {task.title}
                      </span>
                    </div>
                  ))}
                  {incompleteTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className="w-4 h-4 rounded border border-border" />
                      <span className="text-foreground">{task.title}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      今日: {tasksForDate.length} 項任務,{' '}
                      {completedTasks.length} 項已完成
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Journal Editor */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              今日記錄
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="今天發生了什麼？有什麼想記錄的..."
              className="w-full min-h-[150px] px-4 py-3 rounded-xl border border-input bg-secondary/20 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
            />
          </div>

          {/* Photo Gallery Placeholder */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              照片
            </label>
            <button className="flex items-center justify-center gap-2 w-full h-24 rounded-xl border border-dashed border-border bg-secondary/10 text-muted-foreground hover:bg-secondary/30 hover:border-primary/50 transition-colors">
              <Plus className="w-5 h-5" />
              <span className="text-sm">添加照片</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-secondary/20">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            儲存日記
          </Button>
        </div>
      </div>
    </div>
  )
}
