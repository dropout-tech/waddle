import type { ScratchpadItem } from '@/lib/types'
/** Small content-only preview. Never loads remote images, URLs or private attachment bytes. */
export function boardThumbnail(items:ScratchpadItem[]):string|undefined {
  if(typeof document==='undefined'||!items.length)return undefined
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=240
  const ctx=canvas.getContext('2d');if(!ctx)return undefined
  ctx.fillStyle='#faf7ee';ctx.fillRect(0,0,480,240)
  const visible=items.slice(0,6)
  visible.forEach((item,i)=>{
    const x=12+(i%3)*156,y=12+Math.floor(i/3)*112
    ctx.fillStyle=['#ede9d6','#e0e8da','#f2dfd5'][i%3];ctx.fillRect(x,y,144,100)
    ctx.fillStyle='#3e3e35';ctx.font='15px sans-serif'
    const text=item.type==='image'?'圖片':item.type==='link'?(item.title||'連結'):(item.title||item.content).replace(/\s+/g,' ').slice(0,60)
    for(let n=0;n<3;n++)ctx.fillText(text.slice(n*8,n*8+8),x+10,y+25+n*25,124)
  })
  return canvas.toDataURL('image/png')
}
