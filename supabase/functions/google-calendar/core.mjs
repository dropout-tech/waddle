export const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
const enc = new TextEncoder()
export const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0))
export async function hash(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))) }
export async function eventId(value) { return 'h'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))), x=>x.toString(16).padStart(2,'0')).join('') }
export async function seal(value, secret, owner) {
 const raw=unb64(secret); if(raw.length!==32) throw Error('configuration_invalid')
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']); const iv=crypto.getRandomValues(new Uint8Array(12))
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(owner)},key,enc.encode(value))
 return `${b64(iv)}.${b64(new Uint8Array(data))}`
}
export async function unseal(value, secret, owner) {
 const [iv,data]=value.split('.');const key=await crypto.subtle.importKey('raw',unb64(secret),'AES-GCM',false,['decrypt'])
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:enc.encode(owner)},key,unb64(data)))
}
const dayMs=86400000
const date = s => { if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('invalid_source_date');const d=new Date(s+'T00:00:00Z');if(d.toISOString().slice(0,10)!==s)throw Error('invalid_source_date');return d }
export const addDays=(s,n)=>new Date(date(s).getTime()+n*dayMs).toISOString().slice(0,10)
export function localDay(now,zone) {const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-')}
// Mirrors calendar-utils taskOccursOnDate, using civil UTC arithmetic so the
// Edge runtime timezone cannot alter Huddle recurrence dates.
export function occurs(t,day) {
 if(!t.scheduled_date || t.exdates?.includes(day))return false
 if(t.scheduled_date===day)return true
 if(!t.is_recurring || !t.recurrence_type || day<t.scheduled_date || (t.recurrence_end_date && day>t.recurrence_end_date))return false
 const a=date(t.scheduled_date),b=date(day),days=(b-a)/dayMs,n=Math.max(1,t.recurrence_interval||1)
 switch(t.recurrence_type){case 'daily':case 'custom':return days%n===0;case 'weekly':return Math.floor((days-b.getUTCDay()+a.getUTCDay())/7)%n===0 && (t.recurrence_days_of_week?.length?t.recurrence_days_of_week.includes(b.getUTCDay()):a.getUTCDay()===b.getUTCDay());case 'monthly':{const m=(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth();return m>0&&m%n===0&&a.getUTCDate()===b.getUTCDate()}default:throw Error('unsupported_recurrence')}
}
function time(s) {if(!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(s))throw Error('invalid_source_time');return s.length===5?s+':00':s}
const zoneCache=new Map()
// Reject nonexistent and ambiguous DST wall times instead of silently changing
// an appointment. Explicit-offset meeting timestamps do not need this check.
export function wallInstant(day,clock,zone) {
 const wall=`${day}T${clock.slice(0,8)}`,naive=Date.parse(wall+'Z'),cacheKey=zone+day
 let offsets=zoneCache.get(cacheKey)
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
 const civil=ms=>fmt.format(new Date(ms)).replace(' ','T')
 if(!offsets){offsets=new Set();for(const h of [-36,-12,0,12,36]){const ms=naive+h*3600000;offsets.add(Date.parse(civil(ms)+'Z')-ms)}zoneCache.set(cacheKey,offsets)}
 const candidates=[...offsets].map(o=>naive-o).filter(ms=>civil(ms)===wall)
 if(candidates.length!==1)throw Error('invalid_source_time')
 return new Date(candidates[0]).toISOString()
}
export function desiredEvents(snapshot,connection,now=new Date()) {
 const today=localDay(now,connection.time_zone),from=addDays(today,-30),to=addDays(today,365),out=new Map()
 for(const t of snapshot.tasks){
  if(t.is_archived||!connection.workspace_ids.includes(t.workspace_id)||!t.scheduled_date)continue
  if(!t.scheduled_start_time&&!t.scheduled_end_time)continue
  const start=time(t.scheduled_start_time||''),midnight=/^24:00(?::00(?:\.0+)?)?$/.test(t.scheduled_end_time||''),end=midnight?'00:00:00':time(t.scheduled_end_time||'')
  const days=new Set();for(let d=from;d<=to;d=addDays(d,1))days.add(d)
  for(const m of snapshot.mappings||[])if(m.source_key.startsWith(`task:${t.id}:`))days.add(m.source_key.slice(-10))
  for(const day of [...days].sort())if(occurs(t,day)){
   out.set(`task:${t.id}:${day}`,{summary:t.title,description:t.description||'',start:{dateTime:wallInstant(day,start,connection.time_zone),timeZone:connection.time_zone},end:{dateTime:wallInstant(midnight||end<=start?addDays(day,1):day,end,connection.time_zone),timeZone:connection.time_zone}})
  }
 }
 for(const m of snapshot.meetings){const day=localDay(new Date(m.starts_at),connection.time_zone);if((day<from||day>to)&&!(snapshot.mappings||[]).some(x=>x.source_key===`meeting:${m.id}`))continue
  out.set(`meeting:${m.id}`,{summary:m.title,description:m.description||'',location:m.location||'',start:{dateTime:m.starts_at,timeZone:m.time_zone},end:{dateTime:m.ends_at,timeZone:m.time_zone}})
 }
 if(out.size>20000)throw Error('sync_capacity_exceeded')
 return {events:out,from,to}
}
// Google normalizes dateTime offsets; compare instants where offsets exist and
// preserve wall time comparison for task payloads without offsets.
export function sameEvent(remote,expected) {
 const stamp=(a,b)=>{if(!a||!b)return false;if(/[zZ]|[+-]\d\d:\d\d$/.test(b.dateTime))return Date.parse(a.dateTime)===Date.parse(b.dateTime);return a.dateTime?.slice(0,19)===b.dateTime?.slice(0,19)&&a.timeZone===b.timeZone}
 return remote.status!=='cancelled'&&(remote.summary||'')===(expected.summary||'')&&(remote.description||'')===(expected.description||'')&&(remote.location||'')===(expected.location||'')&&stamp(remote.start,expected.start)&&stamp(remote.end,expected.end)
}
