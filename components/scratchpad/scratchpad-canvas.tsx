'use client'
/* eslint-disable @next/next/no-img-element -- canvas accepts user data URLs and generated SVG strokes */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CheckSquare, FileText, Grip, ImagePlus, Link2, Maximize2, Minus, Pencil, Plus, Scan, Trash2, Type } from 'lucide-react'
import type { ScratchpadItem } from '@/lib/types'
import { canvasGeometry, type CanvasGeometry } from '@/lib/scratchpad-canvas'
import { cn } from '@/lib/utils'
import { WhiteboardDetail } from './whiteboard-detail'
import { createChecklistDocument, getWhiteboardDocument, hasWhiteboardDocument, replaceWhiteboardSourceLink, whiteboardChecklistSummary, whiteboardDocumentText } from '@/lib/whiteboard-document'

interface ScratchpadCanvasProps {
  items: ScratchpadItem[]
  date: string
  readOnly: boolean
  onAddItem: (date: string, item: ScratchpadItem) => void
  onUpdateItem: (id: string, patch: Partial<ScratchpadItem>) => void
  onDeleteItem: (id: string) => void
}
type CanvasEditor = { id: string; isNew: boolean; date: string; type: 'text' | 'todo' | 'link'; content: string; title: string; geometry: CanvasGeometry; visibleWidth: number; visibleHeight: number }
type Point = { x: number; y: number }
type Gesture = { kind: 'pan' | 'move' | 'resize' | 'draw'; start: Point; original: CanvasGeometry; id?: string; points?: Point[] }
const button = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40'

export function ScratchpadCanvas({ items, date, readOnly, onAddItem, onUpdateItem, onDeleteItem }: ScratchpadCanvasProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [view, setView] = useState({ x: 24, y: 24, zoom: 1 })
  const [preview, setPreview] = useState<{ id: string; geometry: CanvasGeometry } | null>(null)
  const previewRef = useRef<typeof preview>(null)
  const keyboardGeometry = useRef(new Map<string, CanvasGeometry>())
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailItem = items.find(item => item.id === detailId)
  const [selected, setSelected] = useState<string | null>(null)
  const [pen, setPen] = useState(false)
  const [stroke, setStroke] = useState<Point[]>([])
  const [expanded, setExpanded] = useState(false)
  const [editor, setEditorState] = useState<CanvasEditor | null>(null)
  const editorRef = useRef<CanvasEditor | null>(null)
  const editorElement = useRef<HTMLFormElement>(null)
  const composing = useRef(false)
  const setEditor = (next: CanvasEditor | null) => {
    editorRef.current = next
    setEditorState(next)
  }
  const [error, setError] = useState('')
  const selectedItem = items.find(item => item.id === selected)
  const position = () => {
    const origin = { x: (24 - view.x) / view.zoom, y: (24 - view.y) / view.zoom }
    const columns = Math.max(1, Math.floor(((viewport.current?.clientWidth ?? 320) / view.zoom - 48) / 300))
    const occupied = items.map(canvasGeometry)
    for (let index = 0; index < 1000; index += 1) {
      const candidate = { x: origin.x + (index % columns) * 300, y: origin.y + Math.floor(index / columns) * 240, width: 280, height: 220 }
      const overlaps = occupied.some(box => candidate.x < box.x + box.width && candidate.x + candidate.width > box.x && candidate.y < box.y + box.height && candidate.y + candidate.height > box.y)
      if (!overlaps) return candidate
    }
    return { ...origin, width: 280, height: 220 }
  }
  const add = (type: ScratchpadItem['type'], content: string, title?: string, geometry = position()) => {
    const item: ScratchpadItem = { id: crypto.randomUUID(), type, content, title, sortOrder: 0, createdAt: new Date().toISOString(), metadata: { canvas: geometry } }
    onAddItem(date, item); setSelected(item.id)
  }
  const saveGeometry = (item: ScratchpadItem, geometry: CanvasGeometry) => onUpdateItem(item.id, { metadata: { ...item.metadata, canvas: geometry } })
  const changeGeometryWithKeyboard = (item: ScratchpadItem, rendered: CanvasGeometry, kind: 'move' | 'resize', key: string) => {
    const current = keyboardGeometry.current.get(item.id) ?? rendered
    const next = kind === 'move'
      ? { ...current, x: current.x + (key === 'ArrowRight' ? 20 : key === 'ArrowLeft' ? -20 : 0), y: current.y + (key === 'ArrowDown' ? 20 : key === 'ArrowUp' ? -20 : 0) }
      : { ...current, width: Math.max(200, Math.min(2000, current.width + (key === 'ArrowRight' ? 20 : key === 'ArrowLeft' ? -20 : 0))), height: Math.max(160, Math.min(2000, current.height + (key === 'ArrowDown' ? 20 : key === 'ArrowUp' ? -20 : 0))) }
    keyboardGeometry.current.set(item.id, next)
    const local = { id: item.id, geometry: next }
    previewRef.current = local
    setPreview(local)
    saveGeometry(item, next)
    window.setTimeout(() => {
      if (previewRef.current === local) {
        keyboardGeometry.current.delete(item.id)
        previewRef.current = null
        setPreview(null)
      }
    }, 150)
  }
  const world = (clientX: number, clientY: number) => { const rect = viewport.current!.getBoundingClientRect(); return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom } }
  const zoom = (next: number) => {
    const z = Math.max(.25, Math.min(2, next)); const w = viewport.current?.clientWidth ?? 600; const h = viewport.current?.clientHeight ?? 400
    setView(v => ({ zoom: z, x: w / 2 - (w / 2 - v.x) * z / v.zoom, y: h / 2 - (h / 2 - v.y) * z / v.zoom }))
  }
  const fit = () => {
    if (!items.length) { setView({ x: 24, y: 24, zoom: 1 }); return }
    const boxes = items.map(canvasGeometry); const left = Math.min(...boxes.map(b => b.x)); const top = Math.min(...boxes.map(b => b.y)); const width = Math.max(...boxes.map(b => b.x + b.width)) - left; const height = Math.max(...boxes.map(b => b.y + b.height)) - top
    const w = viewport.current?.clientWidth ?? 600; const h = viewport.current?.clientHeight ?? 400; const z = Math.max(.25, Math.min(1, (w - 48) / width, (h - 48) / height))
    setView({ zoom: z, x: (w - width * z) / 2 - left * z, y: (h - height * z) / 2 - top * z })
  }
  const start = (event: ReactPointerEvent<HTMLElement>, kind: Gesture['kind'], item?: ScratchpadItem) => {
    if (event.button !== 0 || (readOnly && kind !== 'pan')) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const point = world(event.clientX, event.clientY)
    gesture.current = { kind, start: { x: event.clientX, y: event.clientY }, original: item ? canvasGeometry(item) : { x: view.x, y: view.y, width: 0, height: 0 }, id: item?.id, points: kind === 'draw' ? [point] : undefined }
    if (item) setSelected(item.id); else setSelected(null)
    if (kind === 'draw') setStroke([point])
  }
  const move = (event: ReactPointerEvent) => {
    const active = gesture.current; if (!active) return
    const dx = event.clientX - active.start.x; const dy = event.clientY - active.start.y
    if (active.kind === 'pan') setView(v => ({ ...v, x: active.original.x + dx, y: active.original.y + dy }))
    else if (active.kind === 'draw') { active.points!.push(world(event.clientX, event.clientY)); setStroke([...active.points!]) }
    else { const b = active.original; const geometry = active.kind === 'move' ? { ...b, x: b.x + dx / view.zoom, y: b.y + dy / view.zoom } : { ...b, width: Math.max(200, Math.min(2000, b.width + dx / view.zoom)), height: Math.max(160, Math.min(2000, b.height + dy / view.zoom)) }; const next = { id: active.id!, geometry }; previewRef.current = next; setPreview(next) }
  }
  const finish = (cancel = false) => {
    const active = gesture.current; gesture.current = null
    if (!cancel && active?.id && previewRef.current) { const item = items.find(i => i.id === active.id); if (item) saveGeometry(item, previewRef.current.geometry) }
    if (!cancel && active?.kind === 'draw' && (active.points?.length ?? 0) > 1) {
      const points = active.points!; const x = Math.min(...points.map(p => p.x)) - 8; const y = Math.min(...points.map(p => p.y)) - 8; const width = Math.max(200, Math.max(...points.map(p => p.x)) - x + 8); const height = Math.max(160, Math.max(...points.map(p => p.y)) - y + 8)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${points.map(p => `${(p.x-x).toFixed(2)},${(p.y-y).toFixed(2)}`).join(' ')}" fill="none" stroke="#6c5b4d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      add('image', `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, '手寫筆記', { x, y, width, height })
    }
    previewRef.current = null; setPreview(null); setStroke([])
  }
  const image = (file?: File) => {
    if (!file || readOnly) return
    if (!file.type.startsWith('image/')) { setError('請選擇圖片檔案。'); return }
    if (file.size > 5 * 1024 * 1024) { setError('圖片需小於 5 MB。'); return }
    const reader = new FileReader(); reader.onload = () => { add('image', String(reader.result), file.name); setError('') }; reader.onerror = () => setError('無法讀取圖片，請重試。'); reader.readAsDataURL(file)
  }
  // Keep the live draft in a ref: blur, toolbar clicks and unmount can happen
  // before React renders the latest keystroke. Clearing it claims the write once.
  // Do not flush on unmount: clearing a day must never recreate a removed item.
  const persistEditor = (draft: CanvasEditor) => {
    if (draft.isNew && !draft.content.trim()) return true
    let content = draft.content
    if (draft.type === 'link') {
      try {
        const url = new URL(/^https?:\/\//i.test(content.trim()) ? content.trim() : `https://${content.trim()}`)
        if (!['http:', 'https:'].includes(url.protocol)) throw Error()
        content = url.href
      } catch { return false }
    }
    if (draft.isNew) {
      onAddItem(draft.date, { id: draft.id, type: draft.type, content, title: draft.title.trim() || undefined, sortOrder: 0, createdAt: new Date().toISOString(), metadata: { canvas: draft.geometry } })
    } else {
      const item = items.find(value => value.id === draft.id)
      if (item && (item.content !== content || (item.title ?? '') !== draft.title.trim())) {
        const metadata = draft.type === 'link' && item.content !== content && hasWhiteboardDocument(item)
          ? { ...item.metadata, document: replaceWhiteboardSourceLink(getWhiteboardDocument(item), item.content, content) }
          : undefined
        onUpdateItem(draft.id, { content, title: draft.title.trim(), ...(metadata ? { metadata } : {}) })
      }
    }
    return true
  }
  const saveEditor = () => {
    if (composing.current) return false
    const draft = editorRef.current
    if (!draft) return true
    if (!persistEditor(draft)) {
      setError('請輸入有效的網址，或按 Escape 取消。')
      return false
    }
    setEditor(null)
    setError('')
    return true
  }
  const beginEditor = (type: CanvasEditor['type'], point?: Point, item?: ScratchpadItem) => {
    if (readOnly || !saveEditor()) return
    if (item && type !== 'link' && hasWhiteboardDocument(item)) { setDetailId(item.id); return }
    const width = Math.min(280, Math.max(200, ((viewport.current?.clientWidth ?? 320) - 32) / view.zoom))
    const height = 220
    const geometry = item ? canvasGeometry(item) : {
      x: point?.x ?? ((viewport.current?.clientWidth ?? 320) / 2 - view.x) / view.zoom - width / 2,
      y: point?.y ?? ((viewport.current?.clientHeight ?? 400) / 2 - view.y) / view.zoom - height / 2,
      width, height,
    }
    // Editing always uses readable text, even when the board was zoomed out.
    // Pan the view rather than moving the object so the clicked world position
    // and an existing object's persisted geometry stay exactly the same.
    const viewportWidth = viewport.current?.clientWidth ?? 320
    const viewportHeight = viewport.current?.clientHeight ?? 400
    const visibleWidth = Math.min(geometry.width, viewportWidth - 32)
    const visibleHeight = Math.min(Math.max(220, geometry.height), viewportHeight - 32)
    const screenX = geometry.x * view.zoom + view.x
    const screenY = geometry.y * view.zoom + view.y
    setView({ zoom: 1, x: Math.max(16, Math.min(screenX, viewportWidth - visibleWidth - 16)) - geometry.x, y: Math.max(16, Math.min(screenY, viewportHeight - visibleHeight - 16)) - geometry.y })
    const id = item?.id ?? crypto.randomUUID()
    setPen(false)
    setSelected(id)
    setError('')
    setEditor({ id, isNew: !item, date, type, content: item?.content ?? '', title: item?.title ?? '', geometry, visibleWidth, visibleHeight })
  }
  const openDetail = (item: ScratchpadItem) => {
    if (!saveEditor()) return
    setSelected(item.id)
    setDetailId(item.id)
  }
  const addChecklist = () => {
    if (readOnly || !saveEditor()) return
    const id = crypto.randomUUID()
    onAddItem(date, { id, type: 'text', content: '', title: '檢查清單', sortOrder: 0, createdAt: new Date().toISOString(), metadata: { canvas: position(), document: createChecklistDocument() } })
    setSelected(id)
    setDetailId(id)
  }
  const renderEditor = () => editor && <form ref={editorElement} data-testid="canvas-inline-editor" className="flex min-h-0 flex-1 flex-col gap-2 p-3" onPointerDown={e => e.stopPropagation()}
    onSubmit={e => { e.preventDefault(); saveEditor() }}
    onBlur={e => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null) || composing.current) return
      saveEditor()
    }}
    onKeyDown={e => {
      e.stopPropagation()
      if (e.nativeEvent.isComposing || composing.current || e.keyCode === 229) return
      if (e.key === 'Escape') { e.preventDefault(); setEditor(null); setError(''); viewport.current?.focus() }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (saveEditor()) viewport.current?.focus() }
    }}>
    <textarea key={editor.id} autoFocus aria-label={editor.type === 'link' ? '連結網址' : '畫布內容'} placeholder={editor.type === 'link' ? '貼上網址…' : editor.type === 'todo' ? '輸入待辦…' : '直接寫下想法…'}
      className="min-h-11 w-full flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
      value={editor.content} onChange={e => { const current = editorRef.current; if (current) setEditor({ ...current, content: e.target.value }) }}
      onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; if (!editorElement.current?.contains(document.activeElement)) saveEditor() }}/>
    {editor.type === 'link' && <input aria-label="連結標題" placeholder="連結標題（選填）" className="min-h-11 w-full rounded-lg border border-border bg-background px-2 text-base" value={editor.title} onChange={e => { const current = editorRef.current; if (current) setEditor({ ...current, title: e.target.value }) }}/>}
    <div className="flex shrink-0 items-center justify-between gap-1 text-xs text-muted-foreground"><span>點空白處儲存</span><button type="button" className={button} onPointerDown={e => e.preventDefault()} onClick={() => { setEditor(null); setError(''); viewport.current?.focus() }}>取消</button></div>
  </form>
  return <section className="min-w-0" aria-label="白板">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">白板</h3><p className="text-xs text-muted-foreground">按兩下空白處寫字；開啟內容可使用記事本編輯工具。</p></div><button className={button} aria-label={expanded ? '縮小畫布區域' : '放大畫布區域'} onClick={() => setExpanded(!expanded)}><Maximize2 size={18}/></button></div>
    {!readOnly && <div className="flex flex-wrap items-center gap-1 border-t border-border py-2" aria-label="畫布工具">
      <button className={button} onClick={() => beginEditor('text')}><Type size={18}/>文字</button>
      <button className={button} onClick={addChecklist}><CheckSquare size={18}/>檢查清單</button>
      <button className={button} onClick={() => fileInput.current?.click()}><ImagePlus size={18}/>圖片</button>
      <button className={button} onClick={() => beginEditor('link')}><Link2 size={18}/>連結</button>
      <button className={cn(button, pen && 'bg-primary/10 text-primary')} aria-pressed={pen} onClick={() => setPen(!pen)}><Pencil size={18}/>畫筆</button>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="加入畫布圖片" onChange={e => { image(e.target.files?.[0]); e.target.value = '' }}/>
    </div>}
    {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
    <div ref={viewport} data-testid="scratchpad-canvas" className={cn('relative isolate w-full touch-none overflow-hidden rounded-xl border border-border bg-secondary/30', pen ? 'cursor-crosshair' : 'cursor-grab')} style={{ height: expanded ? '80dvh' : 'min(65dvh, 720px)', minHeight: 320, backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={e => { if (e.target === e.currentTarget && saveEditor()) start(e, pen && !readOnly ? 'draw' : 'pan') }} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)}
      onDoubleClick={e => { if (e.target === e.currentTarget && !pen) beginEditor('text', world(e.clientX, e.clientY)) }}
      onPaste={e => { const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))?.getAsFile(); if (file) { e.stopPropagation(); e.preventDefault(); image(file) } }}
      onDragEnter={() => setError('')} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); e.preventDefault(); image(e.dataTransfer.files[0]) }} tabIndex={0} aria-label="白板，使用縮放與顯示全部按鈕調整視野">
      <div className="pointer-events-none absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
        {items.map(item => {
          const b = preview?.id === item.id ? preview.geometry : canvasGeometry(item)
          const editing = editor?.id === item.id
          const active = selected === item.id || editing
          const rich = hasWhiteboardDocument(item)
          const plain = item.type === 'text' && !rich
          const document = rich ? getWhiteboardDocument(item) : null
          const checklist = document ? whiteboardChecklistSummary(document) : null
          const previewText = document ? whiteboardDocumentText(document) : item.content
          return <article key={item.id} data-testid="canvas-item" data-canvas-item={item.id}
            className={cn('group pointer-events-auto absolute flex flex-col rounded-xl border text-card-foreground', editing ? 'bg-background' : plain ? 'bg-transparent' : 'bg-card', active ? 'border-primary' : plain ? 'border-transparent' : 'border-border')}
            style={{ left: b.x, top: b.y, width: editing ? editor.visibleWidth : b.width, height: editing ? editor.visibleHeight : b.height, zIndex: editing ? 3 : active ? 2 : 1 }}
            onPointerDown={e => { e.stopPropagation(); setSelected(item.id) }}
            onDoubleClick={e => { if (!editing && !(e.target as HTMLElement).closest('button,input,a')) { e.stopPropagation(); if (rich || readOnly) openDetail(item); else if (item.type === 'text' || item.type === 'todo') beginEditor(item.type, undefined, item) } }}>
            <div className={cn('flex h-11 shrink-0 items-center justify-between px-1', !active && 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
              <button disabled={readOnly || editing} data-testid="canvas-drag-handle" aria-label="拖動卡片" className={cn(button, 'touch-none cursor-grab')} style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'top left' }} onFocus={() => setSelected(item.id)} onPointerDown={e => { if (saveEditor()) start(e, 'move', item) }} onKeyDown={e => { if (readOnly || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); changeGeometryWithKeyboard(item, b, 'move', e.key) }}><Grip size={18}/></button>
              {!plain && <span className="truncate text-xs text-muted-foreground">{item.title || (item.type === 'todo' ? '待辦' : item.type === 'image' ? '圖片' : item.type === 'link' ? '連結' : checklist?.total ? '檢查清單' : '筆記')}</span>}
              {item.type === 'link' && !readOnly && <button className={button} aria-label="編輯連結" title="編輯連結" onClick={() => beginEditor('link', undefined, item)}><Pencil size={16}/></button>}
              <button className={button} style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'top right' }} aria-label="開啟內容" title="開啟內容" onFocus={() => setSelected(item.id)} onClick={() => openDetail(item)}><FileText size={16}/></button>
            </div>
            {editing ? renderEditor() : <div className="min-h-0 flex-1 overflow-auto p-3 pb-11 text-base">
              {checklist && checklist.total > 0 && <p className="mb-2 text-xs text-muted-foreground">已完成 {checklist.checked} / {checklist.total} 項</p>}
              {item.type === 'image' ? <img src={item.content} alt={item.title || '畫布圖片'} draggable={false} className="h-full w-full object-contain"/> : item.type === 'link' ? <a href={/^https?:\/\//i.test(item.content) ? item.content : undefined} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{item.title || item.content}</a> : <div className="flex items-start gap-2">{item.type === 'todo' && !rich && <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center" style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'top left' }}><span className="sr-only">完成畫布待辦</span><input type="checkbox" aria-label="完成畫布待辦" checked={!!item.isChecked} disabled={readOnly} className="h-6 w-6" onChange={e => onUpdateItem(item.id, { isChecked: e.target.checked })}/></label>}<p tabIndex={readOnly ? undefined : 0} role={readOnly ? undefined : 'button'} aria-label={readOnly ? undefined : `編輯${item.type === 'todo' ? '待辦' : '文字'}：${item.content}`} onKeyDown={e => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); beginEditor(item.type as CanvasEditor['type'], undefined, item) } }} className={cn('min-h-11 min-w-0 flex-1 whitespace-pre-wrap break-words leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary [overflow-wrap:anywhere]', !readOnly && 'cursor-text', !rich && item.isChecked && 'text-muted-foreground line-through')}>{previewText || (checklist?.total ? '開啟內容，開始編輯檢查清單' : '開啟內容，開始寫筆記')}</p></div>}
            </div>}
            {!readOnly && !editing && <button data-testid="canvas-resize-handle" aria-label="調整卡片大小" className={cn(button, 'absolute bottom-0 right-0 touch-none cursor-se-resize bg-background', !active && 'opacity-0 focus:opacity-100')} style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'bottom right' }} onFocus={() => setSelected(item.id)} onPointerDown={e => start(e, 'resize', item)} onKeyDown={e => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); changeGeometryWithKeyboard(item, b, 'resize', e.key) }}><Maximize2 size={15}/></button>}
          </article>
        })}
        {editor?.isNew && !readOnly && <article data-testid="canvas-draft" className={cn('pointer-events-auto absolute flex flex-col rounded-xl border border-primary text-foreground', editor.type === 'text' ? 'bg-background' : 'bg-card')} style={{ left: editor.geometry.x, top: editor.geometry.y, width: editor.visibleWidth, height: editor.visibleHeight, zIndex: 3 }}><div className="h-11 shrink-0"/>{renderEditor()}</article>}
        {stroke.length > 1 && <svg className="absolute overflow-visible" width="1" height="1"><polyline points={stroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#6c5b4d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      {!items.length && !stroke.length && !editor && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">{readOnly ? '這天還沒有白板內容' : pen ? '在空白處開始畫圖' : '按兩下這裡直接寫字，或點「文字」開始。'}</div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-1 py-2"><div className="flex items-center"><button className={button} aria-label="縮小畫布" disabled={view.zoom <= .25} onClick={() => zoom(view.zoom - .1)}><Minus size={18}/></button><span className="min-w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(view.zoom * 100)}%</span><button className={button} aria-label="放大畫布" disabled={view.zoom >= 2} onClick={() => zoom(view.zoom + .1)}><Plus size={18}/></button><button className={button} onClick={fit}><Scan size={18}/>顯示全部</button></div>
      {selectedItem && !readOnly && <div className="flex items-center"><button className={button} aria-label="刪除選取的畫布卡片" onClick={() => { if (window.confirm('確定刪除這張畫布卡片？')) { onDeleteItem(selectedItem.id); setSelected(null) } }}><Trash2 size={17}/></button></div>}
    </div>
    {detailItem && <WhiteboardDetail key={detailItem.id} item={detailItem} readOnly={readOnly} onUpdateItem={onUpdateItem} onClose={() => setDetailId(null)}/>}
  </section>
}
