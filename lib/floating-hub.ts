/**
 * 懸浮工作站（floating hub）的共用狀態。
 *
 * 瀏覽器規定「永遠置頂的懸浮視窗（Document PiP）同時只能存在一個」，
 * 而使用者要計時器、記事本、白板**三個都**不被蓋住——所以三個功能共用
 * 同一顆置頂視窗，頂端用分頁切換。這個模組就是那顆視窗的單一真相：
 * 誰開的、現在停在哪個分頁、看哪一則筆記。
 *
 * 為什麼不是 React context：入口散在兩棵不相鄰的子樹
 * （計時器迷你膠囊活在 FocusTimerProvider 的 portal 裡、記事本/白板的
 * 彈出鈕活在各自頁面），而實際渲染內容的 <FloatingHub> 又是第三個位置。
 * 用 module-level store + useSyncExternalStore，誰都能開、誰都能訂閱，
 * 不用把 setState 沿著樹一路傳。
 */
import { canFloat, openPipWindow, supportsPip } from './floating-window'

export type HubTab = 'timer' | 'note' | 'scratchpad'

export interface HubState {
  /** 置頂視窗本體；null = 沒開。 */
  window: Window | null
  tab: HubTab
  /** 記事本分頁目前鎖定的筆記（undefined = 列表）。 */
  noteId?: string
}

let state: HubState = { window: null, tab: 'timer' }
const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}

export function subscribeHub(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function getHubState(): HubState {
  return state
}
// SSR 用的固定快照（useSyncExternalStore 要求 identity 穩定）。
const SERVER_STATE: HubState = { window: null, tab: 'timer' }
export function getHubServerState(): HubState {
  return SERVER_STATE
}

/** 這個環境能不能開懸浮工作站（桌面 Chrome/Edge 才行）。 */
export function hubAvailable(): boolean {
  return canFloat() && supportsPip()
}

// 開啟時要求的視窗大小，依第一個要看的分頁挑（之後使用者可自由縮放，
// 瀏覽器也會記住上次的位置與大小）。
const SIZES: Record<HubTab, { width: number; height: number }> = {
  timer: { width: 280, height: 360 },
  note: { width: 400, height: 560 },
  scratchpad: { width: 420, height: 600 },
}

/**
 * 開啟懸浮工作站並切到指定分頁。已經開著就只切分頁（並帶到前景）。
 * **必須在使用者點擊的同一個 tick 呼叫**（瀏覽器要求 user activation）。
 */
export async function openFloatingHub(tab: HubTab, opts?: { noteId?: string }): Promise<boolean> {
  const existing = state.window
  if (existing && !existing.closed) {
    state = { ...state, tab, noteId: opts?.noteId ?? state.noteId }
    emit()
    try { existing.focus() } catch {}
    return true
  }
  const w = await openPipWindow(SIZES[tab])
  if (!w) return false
  state = { window: w, tab, noteId: opts?.noteId ?? state.noteId }
  emit()
  return true
}

export function setHubTab(tab: HubTab) {
  if (state.tab === tab) return
  state = { ...state, tab }
  emit()
}

export function setHubNoteId(noteId: string | undefined) {
  if (state.noteId === noteId) return
  state = { ...state, noteId }
  emit()
}

/** 使用者在主視窗按「收回」。 */
export function closeFloatingHub() {
  const w = state.window
  state = { ...state, window: null }
  emit()
  try { w?.close() } catch {}
}

/** 視窗被瀏覽器那側關掉（pagehide）時同步回 store。 */
export function hubWindowClosed() {
  if (!state.window) return
  state = { ...state, window: null }
  emit()
}
