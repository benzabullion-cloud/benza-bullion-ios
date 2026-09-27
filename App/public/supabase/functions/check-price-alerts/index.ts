import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY=Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY=Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT=Deno.env.get('VAPID_SUBJECT')||'mailto:benzabullion@gmail.com';
webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
const symbols={gold:'XAU',silver:'XAG',platinum:'XPT',palladium:'XPD',copper:'HG'} as const;
const names={gold:'Gold',silver:'Silver',platinum:'Platinum',palladium:'Palladium',copper:'Copper'} as const;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);

async function priceFor(metal:keyof typeof symbols){
  const r=await fetch(`https://api.gold-api.com/price/${symbols[metal]}`,{headers:{'cache-control':'no-cache'}});
  if(!r.ok)throw new Error(`${metal} price HTTP ${r.status}`);
  const d=await r.json(); let p=Number(d.price);
  if(metal==='copper')p=p/16; // HG USD/lb -> USD/avoirdupois oz, matching Benza portfolio/watchlist convention.
  if(!Number.isFinite(p)||p<=0)throw new Error(`Invalid ${metal} price`);
  return p;
}

Deno.serve(async()=>{
  try{
    const prices:any={};
    for(const m of Object.keys(symbols) as (keyof typeof symbols)[])try{prices[m]=await priceFor(m)}catch(e){console.error(e)}
    const {data:alerts,error}=await db.from('price_alerts').select('*').eq('enabled',true);
    if(error)throw error;
    let sent=0;
    for(const a of alerts||[]){
      const current=Number(prices[a.metal]); if(!current)continue;
      const reached=a.direction==='lower'?current<=Number(a.target):current>=Number(a.target);
      if(!reached){if(a.is_triggered)await db.from('price_alerts').update({is_triggered:false,updated_at:new Date().toISOString()}).eq('id',a.id);continue;}
      if(a.is_triggered)continue;
      const {data:subs}=await db.from('notification_subscriptions').select('*').eq('user_id',a.user_id).eq('enabled',true);
      const label=a.direction==='lower'?'lower':'higher';
      const payload=JSON.stringify({title:`${names[a.metal as keyof typeof names]} price target reached`,body:`${names[a.metal as keyof typeof names]} is ${money(current)} / oz — your ${label} target was ${money(Number(a.target))}.`,tag:`benza-${a.metal}-${a.direction}`,url:'./'});
      for(const s of subs||[]){
        try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);sent++;}
        catch(e:any){console.error('push failed',e?.statusCode||'',e?.message||e);if(e?.statusCode===404||e?.statusCode===410)await db.from('notification_subscriptions').delete().eq('id',s.id);}
      }
      await db.from('price_alerts').update({is_triggered:true,last_notified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',a.id);
    }
    return new Response(JSON.stringify({ok:true,sent,prices}),{headers:{'content-type':'application/json'}});
  }catch(e:any){return new Response(JSON.stringify({ok:false,error:e?.message||String(e)}),{status:500,headers:{'content-type':'application/json'}})}
});
