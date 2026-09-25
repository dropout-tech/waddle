import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const env={};for(const f of ['.env.local','.env.e2e.local']) for(const l of readFileSync(f,'utf8').split('\n')){if(!l.includes('=')||l.startsWith('#'))continue;const i=l.indexOf('=');env[l.slice(0,i)]=l.slice(i+1).trim().replace(/^['"]|['"]$/g,'');}
const c=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data,error}=await c.auth.signInWithPassword({email:env.E2E_EMAIL,password:env.E2E_PASSWORD});if(error)throw Error(error.message);
for(const action of ['list','directory','inbox']){const r=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/meeting-import',{method:'POST',headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action})}); const j=await r.json(); console.log(JSON.stringify({action,status:r.status,enabled:j.enabled,limit:j.limit,records:j.meetings?.length,peers:j.peers?.length,inbox:j.assignments?.length,error:j.error||j.message}));}
const unauth=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/meeting-import',{method:'POST',headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'inbox'})});
if(unauth.status!==401)throw Error('Unauthenticated request was not refused');
const blocked=await c.rpc('respond_meeting_assignment',{p_user:data.user.id,p_id:crypto.randomUUID(),p_accept:false,p_category:null});
if(!blocked.error)throw Error('Client RPC must be refused');
console.log(JSON.stringify({unauthenticated:unauth.status,directClientRpc:'denied',code:blocked.error.code}));
await c.auth.signOut();
