const {readFileSync}=require('node:fs');
const {createContext,runInContext}=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');

const html=readFileSync('App/public/index.html','utf8');
const preferences=html.slice(html.indexOf('const DEFAULT_NOTIFICATION_PREFS'),html.indexOf("let benzaVapidPublicKey="));

test('a stale settings refresh cannot undo a saved notification toggle',async()=>{
  const reads=[];
  let finishSave;
  const context=createContext({
    currentUser:{id:'current-user'},console,document:{getElementById:()=>null},
    supabaseClient:{from:()=>({
      select:()=>({eq:()=>({maybeSingle:()=>new Promise(resolve=>reads.push(resolve))})}),
      upsert:(values)=>({select:()=>({single:()=>new Promise(resolve=>{
        assert.equal(values.daily_summary,true);
        finishSave=resolve;
      })})})
    })}
  });
  runInContext(preferences,context);
  const old=context.loadNotificationPreferences();
  const save=context.toggleNotificationPreference('daily_summary');
  const duringSave=context.loadNotificationPreferences();
  finishSave({error:null});
  await save;
  for(const finish of reads)finish({data:{daily_summary:false,timezone:context.detectedBenzaTimezone()},error:null});
  await Promise.all([old,duringSave]);
  assert.equal(runInContext('benzaNotificationPrefs.daily_summary',context),true);
});

test('all five ticker cards display a USD per ounce label',()=>{
  const labels=[...html.matchAll(/class="marketIdentity"><b>[^<]+<\/b><span>([^<]+)<\/span>/g)].map(match=>match[1]);
  assert.deepEqual(labels,['XAU','XAG','XPT','XPD','HG'].map(symbol=>symbol+' · USD / oz'));
});

test('first alert invites once per account and inline reminders follow delivery status',async()=>{
  const dialog={open:false,shown:0,showModal(){this.open=true;this.shown++},close(){this.open=false},querySelector:()=>null};
  const watch={hidden:true,querySelector:()=>null};
  const milestones={hidden:true,querySelector:()=>null};
  const values=new Map();
  let settingsTab;
  const context=createContext({
    currentUser:{id:'current-user'},benzaWatchlist:[{}],activeMarketsTab:'watchlist',
    document:{addEventListener(){},getElementById:id=>({
      priceNotificationInvite:dialog,watchNotificationInvite:watch,milestoneNotificationInvite:milestones,
      marketsScreen:{classList:{contains:()=>true}}
    })[id]},
    localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},
    updateNotificationUI:async()=>{},
    openSettings:tab=>{settingsTab=tab}
  });
  runInContext(html.slice(html.indexOf('let notificationInviteStatus'),html.indexOf('let nativeNotificationStatusLoad')),context);
  context.setNotificationInviteStatus('current-user','off');
  assert.equal(watch.hidden,false);
  assert.equal(milestones.hidden,false);
  await context.refreshPriceNotificationInvite('current-user',false);
  assert.equal(dialog.shown,0);
  await context.refreshPriceNotificationInvite('current-user',true);
  dialog.close();
  await context.refreshPriceNotificationInvite('current-user',true);
  assert.equal(dialog.shown,1);
  dialog.open=true;
  context.openNotificationInviteSettings();
  assert.equal(dialog.open,false);
  assert.equal(settingsTab,'notifications');
  context.setNotificationInviteStatus('current-user','enabled');
  assert.equal(watch.hidden,true);
  assert.equal(milestones.hidden,true);
});
