'use client'

/**
 * 專注白板的獨立資料層。
 *
 * 為什麼不直接用 `useWaddleData()`：那個 hook 一次載入工作區、任務、日曆、
 * 設定……整套（2900 行）。便條紙視窗只需要 `scratchpad_items` 一張表，
 * 用整套會讓一個小視窗把整個帳號的資料拉一遍。
 *
 * 行為刻意跟 use-waddle-data 的白板區段一致（樂觀更新 + 失敗回滾 + 同一組
 * 欄位對應），兩邊寫的是同一張表；主視窗與便條紙視窗各自持有自己的快取，
 * 重新整理才會看到對方的改動——白板是「今天想到什麼就記一下」的用途，
 * 不做即時雙向同步是刻意的取捨（避免為此拉進 realtime 訂閱）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { ScratchpadItem } from '@/lib/types'

type ScratchpadUpdate = Database['public']['Tables']['scratchpad_items']['Update']

export function useScratchpad() {
  const supabase = createClient()
  const [scratchpadByDate, commitScratchpadByDate] = useState<Record<string, ScratchpadItem[]>>({})
  const scratchpadRef = useRef<Record<string, ScratchpadItem[]>>({})
  // A single FIFO includes date-wide clear and reorder operations, so a
  // pending insert cannot land after its delete or overwrite a later edit.
  const scratchpadWriteTailRef = useRef<Promise<unknown>>(Promise.resolve())
  const enqueueScratchpadWrite = useCallback(<T,>(write: () => PromiseLike<T>): Promise<T> => {
    const result = scratchpadWriteTailRef.current.catch(() => undefined).then(write)
    scratchpadWriteTailRef.current = result
    return result
  }, [])
  // Resolve mutation snapshots synchronously. React may defer/replay state
  // updaters, so request payloads and rollback data must never depend on them.
  const setScratchpadByDate = useCallback((action: Record<string, ScratchpadItem[]> | ((previous: Record<string, ScratchpadItem[]>) => Record<string, ScratchpadItem[]>)) => {
    const next = typeof action === 'function' ? action(scratchpadRef.current) : action
    scratchpadRef.current = next
    commitScratchpadByDate(next)
  }, [])
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (cancelled) return
      userIdRef.current = auth.user?.id ?? null
      if (!auth.user) { setLoading(false); return }

      const { data: rows, error } = await supabase
        .from('scratchpad_items')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) { console.error('[scratchpad] load failed', error); setLoading(false); return }

      const built: Record<string, ScratchpadItem[]> = {}
      for (const r of rows ?? []) {
        const item: ScratchpadItem = {
          id: r.id,
          type: r.type as ScratchpadItem['type'],
          content: r.content,
          title: r.title ?? undefined,
          isChecked: r.is_checked ?? undefined,
          sortOrder: r.sort_order ?? 0,
          parentId: r.parent_id ?? undefined,
          metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
          createdAt: r.created_at,
        }
        ;(built[r.date] ??= []).push(item)
      }
      // 每天內由舊到新（sort_order 為主、created_at 破平手）——跟主視窗一致。
      for (const date in built) {
        built[date].sort((a, b) =>
          a.sortOrder !== b.sortOrder
            ? a.sortOrder - b.sortOrder
            : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      }
      setScratchpadByDate(built)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, setScratchpadByDate])

  const addItem = useCallback(async (date: string, item: ScratchpadItem) => {
    const userId = userIdRef.current
    if (!userId) { toast.error('請先登入再儲存白板'); return }
    const existing = scratchpadRef.current[date] ?? []
    const nextOrder = existing.length ? Math.max(...existing.map((i) => i.sortOrder)) + 10 : 0
    const placed = { ...item, sortOrder: nextOrder }
    setScratchpadByDate((prev) => ({ ...prev, [date]: [...(prev[date] ?? []), placed] }))
    try {
      const { error } = await enqueueScratchpadWrite(() => supabase.from('scratchpad_items').insert({
        id: placed.id,
        user_id: userId,
        date,
        type: placed.type,
        content: placed.content,
        title: placed.title ?? null,
        is_checked: placed.isChecked ?? false,
        sort_order: placed.sortOrder,
        parent_id: placed.parentId ?? null,
        metadata: (placed.metadata ?? null) as never,
      }))
      if (error) throw error
    } catch (error) {
      setScratchpadByDate((prev) => ({
        ...prev,
        [date]: (prev[date] ?? []).filter((i) => i.id !== placed.id),
      }))
      console.error('[scratchpad] add failed', error)
      toast.error('儲存失敗：新增白板項目')
    }
  }, [supabase, setScratchpadByDate, enqueueScratchpadWrite])

  const updateItem = useCallback(async (id: string, patch: Partial<ScratchpadItem>) => {
    const userId = userIdRef.current
    if (!userId) { toast.error('請先登入再儲存白板'); return }
    const entry = Object.entries(scratchpadRef.current).find(([, items]) => items.some((i) => i.id === id))
    if (!entry) { toast.error('儲存失敗：找不到白板項目，請重新整理'); return }
    const [date, items] = entry
    const previous = items.find((i) => i.id === id)!
    const optimistic = { ...previous, ...patch }
    setScratchpadByDate((prev) => ({
      ...prev,
      [date]: (prev[date] ?? []).map((i) => i.id === id ? optimistic : i),
    }))
    try {
      const dbPatch: ScratchpadUpdate = {}
      if (patch.content !== undefined) dbPatch.content = patch.content
      if (patch.title !== undefined) dbPatch.title = patch.title
      if (patch.type !== undefined) dbPatch.type = patch.type
      if (patch.isChecked !== undefined) dbPatch.is_checked = patch.isChecked
      if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder
      if (patch.parentId !== undefined) dbPatch.parent_id = patch.parentId
      if (patch.metadata !== undefined) dbPatch.metadata = patch.metadata as ScratchpadUpdate['metadata']
      const { error } = await enqueueScratchpadWrite(() => supabase.from('scratchpad_items')
        .update(dbPatch).eq('id', id).eq('user_id', userId).select('id').single())
      if (error) throw error
    } catch (error) {
      // Restore only fields still owned by this optimistic edit. Another item's
      // content, or a later edit to this item, must survive this request's failure.
      setScratchpadByDate((prev) => ({
        ...prev,
        [date]: (prev[date] ?? []).map((item) => {
          if (item.id !== id) return item
          const restore = { ...item }
          for (const key of Object.keys(patch) as (keyof ScratchpadItem)[]) {
            if (Object.is(item[key], optimistic[key])) {
              Object.assign(restore, { [key]: previous[key] })
            }
          }
          return restore
        }),
      }))
      console.error('[scratchpad] update failed', error)
      toast.error('儲存失敗：編輯白板項目')
    }
  }, [supabase, setScratchpadByDate, enqueueScratchpadWrite])

  const deleteItem = useCallback(async (id: string) => {
    const userId = userIdRef.current
    if (!userId) { toast.error('請先登入再儲存白板'); return }
    const entry = Object.entries(scratchpadRef.current).find(([, items]) => items.some((i) => i.id === id))
    if (!entry) return
    const [date, items] = entry
    const removed = items.find((i) => i.id === id)!
    setScratchpadByDate((prev) => ({ ...prev, [date]: (prev[date] ?? []).filter((i) => i.id !== id) }))
    try {
      const { error } = await enqueueScratchpadWrite(() => supabase.from('scratchpad_items')
        .delete().eq('id', id).eq('user_id', userId))
      if (error) throw error
    } catch (error) {
      setScratchpadByDate((prev) => ({
        ...prev,
        [date]: (prev[date] ?? []).some((i) => i.id === id)
          ? prev[date]
          : [...(prev[date] ?? []), removed].sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      console.error('[scratchpad] 刪除白板項目 failed', error)
      toast.error('儲存失敗：刪除白板項目')
    }
  }, [supabase, setScratchpadByDate, enqueueScratchpadWrite])

  const reorderItems = useCallback(async (date: string, items: ScratchpadItem[]) => {
    const userId = userIdRef.current
    if (!userId) { toast.error('請先登入再儲存白板'); return }
    const previousOrders = new Map((scratchpadRef.current[date] ?? []).map((i) => [i.id, i.sortOrder]))
    const orders = new Map(items.filter((i) => previousOrders.has(i.id)).map((i) => [i.id, i.sortOrder]))
    // The caller may hold stale content/geometry or omit newly created items.
    // Only merge the requested order; never replace or upsert whole records.
    setScratchpadByDate((prev) => ({
      ...prev,
      [date]: (prev[date] ?? []).map((i) => orders.has(i.id) ? { ...i, sortOrder: orders.get(i.id)! } : i)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    await enqueueScratchpadWrite(async () => {
      await Promise.all(Array.from(orders, async ([id, sortOrder]) => {
        try {
          const { error } = await supabase.from('scratchpad_items')
            .update({ sort_order: sortOrder }).eq('id', id).eq('user_id', userId).select('id').single()
          if (error) throw error
        } catch (error) {
          // A partial failure restores only this item's unchanged order;
          // successful orders, newer edits and additional items remain intact.
          setScratchpadByDate((prev) => ({
            ...prev,
            [date]: (prev[date] ?? []).map((i) => i.id === id && i.sortOrder === sortOrder
              ? { ...i, sortOrder: previousOrders.get(id)! } : i).sort((a, b) => a.sortOrder - b.sortOrder),
          }))
          console.error('[scratchpad] 重新排序白板 failed', error)
          toast.error('儲存失敗：重新排序白板')
        }
      }))
    })
  }, [supabase, setScratchpadByDate, enqueueScratchpadWrite])

  const clearDate = useCallback(async (date: string) => {
    const userId = userIdRef.current
    if (!userId) { toast.error('請先登入再儲存白板'); return }
    const snapshot = scratchpadRef.current[date] ?? []
    setScratchpadByDate((prev) => {
      const next = { ...prev }
      delete next[date]
      return next
    })
    try {
      const { error } = await enqueueScratchpadWrite(() => supabase.from('scratchpad_items')
        .delete().eq('user_id', userId).eq('date', date))
      if (error) throw error
    } catch (error) {
      setScratchpadByDate((prev) => {
        const current = prev[date] ?? []
        const currentIds = new Set(current.map((i) => i.id))
        return { ...prev, [date]: [...current, ...snapshot.filter((i) => !currentIds.has(i.id))]
          .sort((a, b) => a.sortOrder - b.sortOrder) }
      })
      console.error('[scratchpad] 清空白板 failed', error)
      toast.error('儲存失敗：清空白板')
    }
  }, [supabase, setScratchpadByDate, enqueueScratchpadWrite])

  return { scratchpadByDate, loading, addItem, updateItem, deleteItem, reorderItems, clearDate }
}
