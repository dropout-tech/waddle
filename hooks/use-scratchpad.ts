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
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { ScratchpadItem } from '@/lib/types'

type ScratchpadUpdate = Database['public']['Tables']['scratchpad_items']['Update']

export function useScratchpad() {
  const supabase = createClient()
  const [scratchpadByDate, setScratchpadByDate] = useState<Record<string, ScratchpadItem[]>>({})
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
  }, [supabase])

  const addItem = useCallback(async (date: string, item: ScratchpadItem) => {
    const userId = userIdRef.current
    if (!userId) return
    let placed = item
    setScratchpadByDate((prev) => {
      const existing = prev[date] ?? []
      const nextOrder = existing.length ? Math.max(...existing.map((i) => i.sortOrder)) + 10 : 0
      placed = { ...item, sortOrder: nextOrder }
      return { ...prev, [date]: [...existing, placed] }
    })
    const { error } = await supabase.from('scratchpad_items').insert({
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
    })
    if (error) {
      console.error('[scratchpad] add failed', error)
      setScratchpadByDate((prev) => ({
        ...prev,
        [date]: (prev[date] ?? []).filter((i) => i.id !== placed.id),
      }))
    }
  }, [supabase])

  const updateItem = useCallback(async (id: string, patch: Partial<ScratchpadItem>) => {
    let editedDate: string | null = null
    let previous: ScratchpadItem | null = null
    setScratchpadByDate((prev) => {
      const next: Record<string, ScratchpadItem[]> = {}
      for (const [date, items] of Object.entries(prev)) {
        const found = items.find((i) => i.id === id)
        if (found) {
          editedDate = date
          previous = { ...found }
          next[date] = items.map((i) => (i.id === id ? { ...i, ...patch } : i))
        } else {
          next[date] = items
        }
      }
      return next
    })
    if (!editedDate || !previous) return
    const dbPatch: ScratchpadUpdate = {}
    if (patch.content !== undefined) dbPatch.content = patch.content
    if (patch.title !== undefined) dbPatch.title = patch.title
    if (patch.type !== undefined) dbPatch.type = patch.type
    if (patch.isChecked !== undefined) dbPatch.is_checked = patch.isChecked
    if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder
    if (patch.parentId !== undefined) dbPatch.parent_id = patch.parentId
    if (patch.metadata !== undefined) dbPatch.metadata = patch.metadata
    const { error } = await supabase.from('scratchpad_items').update(dbPatch).eq('id', id)
    if (error) {
      console.error('[scratchpad] update failed', error)
      const date = editedDate as string
      const restore = previous as ScratchpadItem
      setScratchpadByDate((prev) => ({
        ...prev,
        [date]: (prev[date] ?? []).map((i) => (i.id === id ? restore : i)),
      }))
    }
  }, [supabase])

  const deleteItem = useCallback(async (id: string) => {
    let removedDate: string | null = null
    let removed: ScratchpadItem | null = null
    setScratchpadByDate((prev) => {
      const next: Record<string, ScratchpadItem[]> = {}
      for (const [date, items] of Object.entries(prev)) {
        const found = items.find((i) => i.id === id)
        if (found) { removedDate = date; removed = found; next[date] = items.filter((i) => i.id !== id) }
        else next[date] = items
      }
      return next
    })
    const { error } = await supabase.from('scratchpad_items').delete().eq('id', id)
    if (error && removedDate && removed) {
      console.error('[scratchpad] delete failed', error)
      const date = removedDate as string
      const restore = removed as ScratchpadItem
      setScratchpadByDate((prev) => ({
        ...prev,
        [date]: [...(prev[date] ?? []), restore].sort((a, b) => a.sortOrder - b.sortOrder),
      }))
    }
  }, [supabase])

  const reorderItems = useCallback(async (date: string, items: ScratchpadItem[]) => {
    const userId = userIdRef.current
    if (!userId) return
    let previousItems: ScratchpadItem[] = []
    setScratchpadByDate((prev) => {
      previousItems = prev[date] ?? []
      return { ...prev, [date]: items }
    })
    // 整批一次 upsert：N 個平行 UPDATE 有「一半成功」的風險。
    const rows = items.map((item) => ({
      id: item.id,
      user_id: userId,
      date,
      type: item.type,
      content: item.content,
      title: item.title ?? null,
      is_checked: item.isChecked ?? false,
      sort_order: item.sortOrder,
      parent_id: item.parentId ?? null,
      metadata: (item.metadata ?? null) as never,
    }))
    const { error } = await supabase.from('scratchpad_items').upsert(rows)
    if (error) {
      console.error('[scratchpad] reorder failed', error)
      setScratchpadByDate((prev) => ({ ...prev, [date]: previousItems }))
    }
  }, [supabase])

  const clearDate = useCallback(async (date: string) => {
    const userId = userIdRef.current
    if (!userId) return
    let snapshot: ScratchpadItem[] = []
    setScratchpadByDate((prev) => {
      snapshot = prev[date] ?? []
      const next = { ...prev }
      delete next[date]
      return next
    })
    const { error } = await supabase
      .from('scratchpad_items')
      .delete()
      .eq('user_id', userId)
      .eq('date', date)
    if (error) {
      console.error('[scratchpad] clear failed', error)
      setScratchpadByDate((prev) => ({ ...prev, [date]: snapshot }))
    }
  }, [supabase])

  return { scratchpadByDate, loading, addItem, updateItem, deleteItem, reorderItems, clearDate }
}
