'use client'
/* eslint-disable @next/next/no-img-element -- canvas accepts user data URLs and generated SVG strokes */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowUp, CheckSquare, Grip, ImagePlus, Link2, Maximize2, Minus, Pencil, Plus, Scan, Trash2, Type } from 'lucide-react'
import type { ScratchpadItem } from '@/lib/types'
import { canvasGeometry, type CanvasGeometry } from '@/lib/scratchpad-canvas'
import { cn } from '@/lib/utils'

interface ScratchpadCanvasProps {
  items: ScratchpadItem[]
  cards: ScratchpadItem[]
  date: string
  readOnly: boolean
  onAddItem: (date: string, item: ScratchpadItem) => void
  onUpdateItem: (id: string, patch: Partial<ScratchpadItem>) => void
  onDeleteItem: (id: string) => void
}
type Point = { x: number; y: number }
type Gesture = { kind: 'pan' | 'move' | 'resize' | 'draw'; start: Point; original: CanvasGeometry; id?: string; points?: Point[] }
const button = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40'

export function ScratchpadCanvas({ items, cards, date, readOnly, onAddItem, onUpdateItem, onDeleteItem }: ScratchpadCanvasProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [view, setView] = useState({ x: 24, y: 24, zoom: 1 })
  const [preview, setPreview] = useState<{ id: string; geometry: CanvasGeometry } | null>(null)
  const previewRef = useRef<typeof preview>(null)
  const keyboardGeometry = useRef(new Map<string, CanvasGeometry>())
  const [selected, setSelected] = useState<string | null>(null)
  const [pen, setPen] = useState(false)
  const [stroke, setStroke] = useState<Point[]>([])
  const [expanded, setExpanded] = useState(false)
  const [editor, setEditor] = useState<{ id?: string; type: 'text' | 'todo' | 'link'; content: string; title: string } | null>(null)
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
  const saveEditor = () => {
    if (!editor?.content.trim()) return
    let content = editor.content.trim()
    if (editor.type === 'link') { try { const url = new URL(/^https?:\/\//i.test(content) ? content : `https://${content}`); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); content = url.href } catch { setError('請輸入有效的網址。'); return } }
    if (editor.id) onUpdateItem(editor.id, { content, title: editor.title.trim() || undefined }); else add(editor.type, content, editor.title.trim() || undefined)
    setEditor(null); setError('')
  }
  return <section className="mt-6 min-w-0 border-t border-border pt-4" aria-label="自由畫布">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">自由畫布</h3><p className="text-xs text-muted-foreground">拖動空白處移動畫布；卡片可自由移動、調整大小。</p></div><button className={button} aria-label={expanded ? '縮小畫布區域' : '放大畫布區域'} onClick={() => setExpanded(!expanded)}><Maximize2 size={18}/></button></div>
    {!readOnly && <div className="flex flex-wrap items-center gap-1 border-t border-border py-2" aria-label="畫布工具">
      <button className={button} onClick={() => { setEditor({ type: 'text', content: '', title: '' }); setPen(false) }}><Type size={18}/>文字</button>
      <button className={button} onClick={() => { setEditor({ type: 'todo', content: '', title: '' }); setPen(false) }}><CheckSquare size={18}/>待辦</button>
      <button className={button} onClick={() => fileInput.current?.click()}><ImagePlus size={18}/>圖片</button>
      <button className={button} onClick={() => setEditor({ type: 'link', content: '', title: '' })}><Link2 size={18}/>連結</button>
      <button className={cn(button, pen && 'bg-primary/10 text-primary')} aria-pressed={pen} onClick={() => setPen(!pen)}><Pencil size={18}/>畫筆</button>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="加入畫布圖片" onChange={e => { image(e.target.files?.[0]); e.target.value = '' }}/>
      {!!cards.length && <select className="min-h-11 max-w-full rounded-lg border border-border bg-background px-2 text-base" aria-label="移入上方卡片" value="" onChange={e => { const item = cards.find(i => i.id === e.target.value); if (item) { saveGeometry(item, position()); setSelected(item.id) } }}><option value="">移入上方卡片…</option>{cards.map(item => <option key={item.id} value={item.id}>{(item.title || (item.type === 'image' ? '圖片' : item.content) || '空白卡片').slice(0, 40)}</option>)}</select>}
    </div>}
    {editor && !readOnly && <form className="mb-3 space-y-2 rounded-xl bg-muted p-3" onSubmit={e => { e.preventDefault(); saveEditor() }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditor(null) } }}>
      <label className="block text-sm">{editor.type === 'link' ? '連結網址' : editor.type === 'todo' ? '待辦內容' : '文字內容'}<textarea autoFocus aria-label="畫布內容" className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-3 text-base" value={editor.content} onChange={e => setEditor({ ...editor, content: e.target.value })}/></label>
      {editor.type === 'link' && <input aria-label="連結標題" placeholder="連結標題（選填）" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })}/>}
      <div className="flex gap-2"><button type="submit" disabled={!editor.content.trim()} className={cn(button, 'bg-primary text-primary-foreground hover:bg-primary/90')}>儲存卡片</button><button type="button" className={button} onClick={() => setEditor(null)}>取消</button></div>
    </form>}
    {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
    <div ref={viewport} data-testid="scratchpad-canvas" className={cn('relative isolate w-full touch-none overflow-hidden rounded-xl border border-border bg-secondary/30', pen ? 'cursor-crosshair' : 'cursor-grab')} style={{ height: expanded ? '75dvh' : 'min(55dvh, 560px)', minHeight: 280, backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={e => { if (e.target === e.currentTarget) start(e, pen && !readOnly ? 'draw' : 'pan') }} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)}
      onPaste={e => { const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))?.getAsFile(); if (file) { e.stopPropagation(); e.preventDefault(); image(file) } }}
      onDragEnter={() => setError('')} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); e.preventDefault(); image(e.dataTransfer.files[0]) }} tabIndex={0} aria-label="自由畫布，使用縮放與顯示全部按鈕調整視野">
      <div className="pointer-events-none absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
        {items.map(item => { const b = preview?.id === item.id ? preview.geometry : canvasGeometry(item); const active = selected === item.id; return <article key={item.id} data-testid="canvas-item" data-canvas-item={item.id} className={cn('pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground', active ? 'border-primary ring-1 ring-primary' : 'border-border')} style={{ left: b.x, top: b.y, width: b.width, height: b.height, zIndex: active ? 2 : 1 }} onPointerDown={e => { e.stopPropagation(); setSelected(item.id) }}>
          <div className="flex shrink-0 items-center justify-between border-b border-border px-1"><button disabled={readOnly} data-testid="canvas-drag-handle" aria-label="拖動卡片" className={cn(button, 'touch-none cursor-grab')} style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'top left' }} onFocus={() => setSelected(item.id)} onPointerDown={e => start(e, 'move', item)} onKeyDown={e => { if (readOnly || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); changeGeometryWithKeyboard(item, b, 'move', e.key) }}><Grip size={18}/></button><span className="truncate text-xs text-muted-foreground">{item.type === 'todo' ? '待辦' : item.type === 'image' ? item.title || '圖片' : item.type === 'link' ? '連結' : '筆記'}</span>{!readOnly && item.type !== 'image' ? <button className={button} style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'top right' }} aria-label="編輯卡片" onFocus={() => setSelected(item.id)} onClick={() => setEditor({ id: item.id, type: item.type as 'text' | 'todo' | 'link', content: item.content, title: item.title || '' })}><Pencil size={16}/></button> : <span className="w-11"/>}</div>
          <div className="min-h-0 flex-1 overflow-auto p-3 text-base">
            {item.type === 'image' ? <img src={item.content} alt={item.title || '畫布圖片'} draggable={false} className="h-full w-full object-contain"/> : item.type === 'link' ? <a href={/^https?:\/\//i.test(item.content) ? item.content : undefined} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{item.title || item.content}</a> : <div className="flex items-start gap-2">{item.type === 'todo' && <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center" style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'top left' }}><span className="sr-only">完成畫布待辦</span><input type="checkbox" aria-label="完成畫布待辦" checked={!!item.isChecked} disabled={readOnly} className="h-6 w-6" onChange={e => onUpdateItem(item.id, { isChecked: e.target.checked })}/></label>}<p className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', item.isChecked && 'text-muted-foreground line-through')}>{item.content}</p></div>}
          </div>
          {!readOnly && <button data-testid="canvas-resize-handle" aria-label="調整卡片大小" className={cn(button, 'absolute bottom-0 right-0 touch-none cursor-se-resize bg-card/90')} style={{ transform: `scale(${1 / view.zoom})`, transformOrigin: 'bottom right' }} onFocus={() => setSelected(item.id)} onPointerDown={e => start(e, 'resize', item)} onKeyDown={e => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); changeGeometryWithKeyboard(item, b, 'resize', e.key) }}><Maximize2 size={15}/></button>}
        </article> })}
        {stroke.length > 1 && <svg className="absolute overflow-visible" width="1" height="1"><polyline points={stroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#6c5b4d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      {!items.length && !stroke.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">{readOnly ? '這天還沒有畫布內容' : pen ? '在空白處開始畫圖' : '從上方加入筆記，或把小卡片移到這裡。'}</div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-1 py-2"><div className="flex items-center"><button className={button} aria-label="縮小畫布" disabled={view.zoom <= .25} onClick={() => zoom(view.zoom - .1)}><Minus size={18}/></button><span className="min-w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(view.zoom * 100)}%</span><button className={button} aria-label="放大畫布" disabled={view.zoom >= 2} onClick={() => zoom(view.zoom + .1)}><Plus size={18}/></button><button className={button} onClick={fit}><Scan size={18}/>顯示全部</button></div>
      {selectedItem && !readOnly && <div className="flex items-center"><button className={button} onClick={() => { onUpdateItem(selectedItem.id, { metadata: { ...selectedItem.metadata, canvas: null } }); setSelected(null) }}><ArrowUp size={16}/>移回上方</button><button className={button} aria-label="刪除選取的畫布卡片" onClick={() => { if (window.confirm('確定刪除這張畫布卡片？')) { onDeleteItem(selectedItem.id); setSelected(null) } }}><Trash2 size={17}/></button></div>}
    </div>
  </section>
}
