'use client'

/**
 * 把一段 React 內容渲染進「永遠置頂」的懸浮視窗（Document Picture-in-Picture）。
 *
 * 關鍵在於這是**同一棵 React 樹**——只是 portal 的目標換成另一個 document。
 * 所以懸浮視窗裡的按鈕直接吃主視窗的 state（計時器的暫停/繼續/結束都是同一份
 * state machine），不需要任何跨視窗同步、也不會有「兩邊時間不一致」的問題。
 *
 * 呼叫端負責在「使用者點擊的當下」呼叫 `openPipWindow()` 拿到 window
 * （瀏覽器要求 transient user activation），再把它交給這個元件。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { mirrorStylesInto } from '@/lib/floating-window'

export function PipPortal({
  pipWindow,
  onClose,
  children,
}: {
  /** 已經開好的懸浮視窗；null 代表沒開。 */
  pipWindow: Window | null
  /** 使用者按了懸浮視窗的關閉鈕（或它被瀏覽器收掉）時通知呼叫端。 */
  onClose: () => void
  children: React.ReactNode
}) {
  // 樣式要先搬完再掛內容，否則會閃一下沒有樣式的裸 HTML。
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!pipWindow) {
      setReady(false)
      return
    }
    const stopMirroring = mirrorStylesInto(pipWindow)
    setReady(true)

    // pagehide 是 PiP 視窗關閉時實際會發的事件（不是 unload/beforeunload）。
    const handleClose = () => onClose()
    pipWindow.addEventListener('pagehide', handleClose)
    return () => {
      pipWindow.removeEventListener('pagehide', handleClose)
      stopMirroring()
      setReady(false)
    }
  }, [pipWindow, onClose])

  if (!pipWindow || !ready) return null
  return createPortal(children, pipWindow.document.body)
}
