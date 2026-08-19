'use client'

/**
 * 懸浮工作站——那顆唯一的「永遠置頂」視窗的內容。
 *
 * 版面：頂端一條分頁列（⏱ 計時器 / 📓 記事本 / 📌 白板），下面是內容區。
 *
 * 三個分頁刻意用兩種掛法：
 *  • **計時器**：React portal，直接吃 FocusTimerProvider 的 state machine
 *    ——暫停/繼續/結束跟主視窗是同一份狀態，秒針也是同一個 tick。
 *    沒在計時的時候顯示快速開始（點一下時長直接開跑，不必回主視窗）。
 *  • **記事本／白板**：iframe 載入 /float/note、/float/scratchpad——
 *    Tiptap、slash 選單、拖曳排序這類重度依賴「自己的 document」的東西，
 *    塞進 portal 會把彈窗開到主視窗去；iframe 給它們一個完整的同源頁面，
 *    什麼都不用改就能動。代價是資料快取跟主視窗分開（跟便條紙視窗一樣）。
 *
 * iframe 採「第一次切到才掛載、之後隱藏不卸載」：打到一半的字在分頁間
 * 切來切去不會消失。
 */
import { useCallback, useState, useSyncExternalStore } from 'react'
import { NotebookPen, StickyNote, Timer } from 'lucide-react'
import {
  getHubServerState, getHubState, hubWindowClosed, setHubTab, subscribeHub, type HubTab,
} from '@/lib/floating-hub'
import { POMODORO_PRESETS, useFocusTimer } from '@/components/timer/focus-timer-provider'
import { formatTime } from '@/lib/timer-format'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { PipPortal } from './pip-portal'

const TABS: Array<{ key: HubTab; label: string; icon: typeof Timer }> = [
  { key: 'timer', label: '計時器', icon: Timer },
  { key: 'note', label: '記事本', icon: NotebookPen },
  { key: 'scratchpad', label: '白板', icon: StickyNote },
]

export function FloatingHub() {
  const hub = useSyncExternalStore(subscribeHub, getHubState, getHubServerState)
  const { t } = useI18n()
  const { state: timerState, session, displayTime, floatingTimerCard, startTimer } = useFocusTimer()

  // 記錄這次開窗期間造訪過的分頁——iframe 掛上去就不拆，切走只隱藏。
  const [seen, setSeen] = useState<ReadonlySet<HubTab>>(() => new Set())
  if (hub.window && !seen.has(hub.tab)) {
    // render 階段調整 state（React 官方允許的 adjust-state-during-render 模式）
    setSeen((prev) => new Set(prev).add(hub.tab))
  }

  const handleClosed = useCallback(() => {
    hubWindowClosed()
    setSeen(new Set())
  }, [])

  const noteSrc = `/float/note${hub.noteId ? `?id=${encodeURIComponent(hub.noteId)}` : ''}`

  return (
    <PipPortal pipWindow={hub.window} onClose={handleClosed}>
      <div className="flex h-full w-full flex-col bg-background text-foreground">
        {/* 分頁列。計時進行中時，「計時器」分頁的標籤直接換成跳動的倒數
            ——人在記事本/白板分頁也隨時看得到剩多少時間。 */}
        <div className="flex shrink-0 items-stretch gap-0.5 border-b border-border bg-card px-1 pt-1">
          {TABS.map(({ key, label, icon: Icon }) => {
            const liveTime = key === 'timer' && timerState !== 'idle' && session
            return (
              <button
                key={key}
                type="button"
                data-hub-tab={key}
                onClick={() => setHubTab(key)}
                aria-selected={hub.tab === key}
                aria-label={liveTime ? `${t(label)} ${formatTime(displayTime)}` : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  hub.tab === key
                    ? 'bg-background text-foreground shadow-[inset_0_2px_0_var(--primary)]'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={liveTime && timerState === 'running' ? { color: session.color } : undefined}
                />
                <span
                  data-hub-tab-time={liveTime ? '' : undefined}
                  className={cn('truncate', liveTime && 'font-mono tabular-nums')}
                >
                  {liveTime ? formatTime(displayTime) : t(label)}
                </span>
              </button>
            )
          })}
        </div>

        {/* 內容區 */}
        <div className="relative min-h-0 flex-1">
          {/* 計時器：portal（共用主視窗的計時狀態） */}
          <div className={cn('absolute inset-0', hub.tab !== 'timer' && 'hidden')}>
            {timerState !== 'idle' && floatingTimerCard ? (
              floatingTimerCard
            ) : (
              <HubIdleTimer onStart={(presetIndex) => startTimer({ presetIndex, forceMini: true })} />
            )}
          </div>

          {/* 記事本／白板：iframe（完整頁面，Tiptap 等自帶 document 的功能不用改） */}
          {seen.has('note') && (
            <iframe
              src={noteSrc}
              title={t('記事本')}
              className={cn('absolute inset-0 h-full w-full border-0', hub.tab !== 'note' && 'hidden')}
            />
          )}
          {seen.has('scratchpad') && (
            <iframe
              src="/float/scratchpad"
              title={t('專注白板')}
              className={cn('absolute inset-0 h-full w-full border-0', hub.tab !== 'scratchpad' && 'hidden')}
            />
          )}
        </div>
      </div>
    </PipPortal>
  )
}

/** 計時器分頁的閒置畫面：一鍵開始，不用回主視窗。 */
function HubIdleTimer({ onStart }: { onStart: (presetIndex: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-4">
      <p className="text-center text-xs text-muted-foreground">{t('還沒有進行中的計時')}</p>
      <div className="flex w-full max-w-56 flex-col gap-1.5">
        {POMODORO_PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            data-hub-idle-preset={i}
            onClick={() => onStart(i)}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-secondary"
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
              {t(p.label)}
            </span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {p.minutes} {t('分鐘')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
