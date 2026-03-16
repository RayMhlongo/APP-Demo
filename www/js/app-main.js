const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzEzfbRaw0tesxfpw1jGHakZVNlZg2rnwV2MXKUg5faA_u5eSNglHJk2YcoLGItMtBx/exec';
const STORE_KEY  = 'cathdelCreamyV3';
const OUTBOX_KEY = STORE_KEY+'-outbox';
const ALERTS_KEY = STORE_KEY+'-alerts';
const LEGACY_STORE_KEY = 'cathelCreamyV3';
const LEGACY_OUTBOX_KEY = LEGACY_STORE_KEY+'-outbox';
const LEGACY_ALERTS_KEY = LEGACY_STORE_KEY+'-alerts';
const API_TIMEOUT_MS = 7000;
const FAST_BOOT_HIDE_MS = 260;
const BRAND_SPLASH_MS = 900;
const OUTBOX_RETRY_MS = 8000;
const ALERT_SCAN_WINDOW_DAYS = 14;
const ALERT_RECHECK_MS = 120000;
const LOGO_SRC   = './client-logo.png';
const RAY_LOGO_SRC = './LOGOO.jpeg';
const GOOGLE_TOKEN_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const CLOUD_BACKUP_FILE = 'cathdel-cloud-backup.json';
let googleTokenClient=null;
let googleAccessToken='';

function defaultDB(){
  return {
    settings:{
      threshold:10,
      active:'YES',
      lowStockAt:5,
      rewardMsg:'Hi! Your child has earned a FREE ice cream from Cathdel Creamy! Collect at next school day.',
      promoMsg:'Special offer from Cathdel Creamy today! Reply YES to order. Limited stock!',
      notifyEnabled:'YES',
      notifyLowStock:'YES',
      notifyRewards:'YES',
      notifyInactive:'YES',
      role:'owner',
      onboarded:false,
      operatorName:'',
      googleClientId:'',
      cloudRestorePrompted:false
    },
    products:[
      {id:'PRD-01',name:'R6 Ice Cream',category:'Single',price:6,stock:50},
      {id:'PRD-02',name:'Choc Dip Stick',category:'Single',price:10,stock:30},
      {id:'PRD-03',name:'Family Pack',category:'Family',price:100,stock:10}
    ],
    customers:[
      {id:'P-001',qrId:'CC-P-001',profileType:'child',parentName:'Akami Mom',childName:'Akami',displayName:'Akami',grade:'5',phone:'+27723408365',credit:0,accountId:'WAL-0001'},
      {id:'P-002',qrId:'CC-P-002',profileType:'child',parentName:'Damian Mom',childName:'Damian',displayName:'Damian',grade:'3',phone:'+27768224643',credit:0,accountId:'WAL-0002'},
      {id:'P-003',qrId:'CC-P-003',profileType:'child',parentName:'Gali and Opfuna Mom',childName:'Gali/Opfuna',displayName:'Gali/Opfuna',grade:'6',phone:'+27818092014',credit:0,accountId:'WAL-0003'}
    ],
    wallets:[
      {id:'WAL-0001',label:'Akami Family',balance:0,members:['P-001']},
      {id:'WAL-0002',label:'Damian Family',balance:0,members:['P-002']},
      {id:'WAL-0003',label:'Gali and Opfuna Family',balance:0,members:['P-003']}
    ],
    orders:[],
    rewardsLog:[]
  };
}
let DB=(()=>{try{const r=localStorage.getItem(STORE_KEY);return r?JSON.parse(r):null;}catch(e){return null;}})();
if(!DB){
  try{
    const legacy=localStorage.getItem(LEGACY_STORE_KEY);
    if(legacy){
      DB=JSON.parse(legacy);
      localStorage.setItem(STORE_KEY,legacy);
    }
  }catch(e){}
}
if(!DB)DB=defaultDB();
if(!DB.settings||typeof DB.settings!=='object')DB.settings={};
if(!DB.settings.lowStockAt)DB.settings.lowStockAt=5;
if(!DB.settings.notifyEnabled)DB.settings.notifyEnabled='YES';
if(!DB.settings.notifyLowStock)DB.settings.notifyLowStock='YES';
if(!DB.settings.notifyRewards)DB.settings.notifyRewards='YES';
if(!DB.settings.notifyInactive)DB.settings.notifyInactive='YES';
if(!DB.settings.role)DB.settings.role='owner';
if(typeof DB.settings.onboarded!=='boolean')DB.settings.onboarded=false;
if(!DB.settings.operatorName)DB.settings.operatorName='';
if(typeof DB.settings.googleClientId!=='string')DB.settings.googleClientId='';
if(typeof DB.settings.cloudRestorePrompted!=='boolean')DB.settings.cloudRestorePrompted=false;
if(!Array.isArray(DB.customers))DB.customers=[];
if(!Array.isArray(DB.orders))DB.orders=[];
if(!Array.isArray(DB.products))DB.products=[];
if(!Array.isArray(DB.rewardsLog))DB.rewardsLog=[];
if(!Array.isArray(DB.wallets))DB.wallets=[];

function normalizeGradeValue(v){
  const digits=String(v??'').replace(/\D/g,'');
  return digits?digits:'';
}
function normalizeProfileType(v){
  return String(v||'').toLowerCase()==='adult'?'adult':'child';
}
function customerDisplayName(c){
  if(!c)return 'Customer';
  const name=String(c.displayName||c.childName||c.parentName||c.id||'Customer').trim();
  return name||'Customer';
}
function customerSubtitle(c){
  if(!c)return '';
  if(c.profileType==='adult'){
    return c.parentName?`Adult • Contact: ${c.parentName}`:'Adult account';
  }
  const gradePart=c.grade?`Grade ${c.grade}`:'No grade';
  return `${gradePart}${c.parentName?` • Guardian: ${c.parentName}`:''}`;
}
function walletLabelFromCustomer(c){
  const base=(c.parentName||c.displayName||c.childName||`Wallet ${c.id||''}`).trim();
  return base||'Family Wallet';
}
function nextWalletId(){
  const max=DB.wallets.reduce((m,w)=>{
    const n=Number(String(w.id||'').replace(/\D/g,''))||0;
    return Math.max(m,n);
  },0);
  return 'WAL-'+String(max+1).padStart(4,'0');
}
function findWalletById(id){
  return DB.wallets.find(w=>String(w.id)===String(id));
}
function ensureWallet(id,label,openingBalance=0){
  let wallet=findWalletById(id);
  if(wallet)return wallet;
  wallet={
    id:id||nextWalletId(),
    label:String(label||'Family Wallet').trim()||'Family Wallet',
    balance:Math.max(0,Number(openingBalance)||0),
    members:[]
  };
  DB.wallets.push(wallet);
  return wallet;
}
function syncWalletMembers(walletId){
  const wallet=findWalletById(walletId);
  if(!wallet)return;
  if(!Array.isArray(wallet.members))wallet.members=[];
  wallet.members=[...new Set(wallet.members.map(v=>String(v||'').trim()).filter(Boolean))];
  wallet.balance=Math.max(0,Number(wallet.balance)||0);
  DB.customers.forEach(c=>{
    if(String(c.accountId)!==String(wallet.id))return;
    if(!wallet.members.includes(c.id))wallet.members.push(c.id);
    c.credit=wallet.balance;
  });
}
function normalizeCustomerWalletState(){
  DB.wallets=DB.wallets.map((w,i)=>({
    id:String(w.id||('WAL-'+String(i+1).padStart(4,'0'))),
    label:String(w.label||'Family Wallet').trim()||'Family Wallet',
    balance:Math.max(0,Number(w.balance)||0),
    members:Array.isArray(w.members)?w.members.map(m=>String(m||'').trim()).filter(Boolean):[]
  }));
  DB.customers=DB.customers.map((c,i)=>{
    const id=String(c.id||('P-'+String(i+1).padStart(3,'0')));
    const profileType=normalizeProfileType(c.profileType);
    const childName=String(c.childName||c.displayName||c.parentName||'').trim();
    const parentName=String(c.parentName||'').trim();
    const displayName=String(c.displayName||childName||parentName||id).trim()||id;
    const grade=profileType==='adult'?'':normalizeGradeValue(c.grade);
    const phone=String(c.phone||'').trim();
    const qrId=String(c.qrId||('CC-'+id)).trim();
    const seedCredit=Math.max(0,Number(c.credit)||0);
    const accountId=String(c.accountId||'').trim();
    return {id,qrId,profileType,parentName,childName,displayName,grade,phone,credit:seedCredit,accountId};
  });
  DB.customers.forEach(c=>{
    let wallet=findWalletById(c.accountId);
    if(!wallet){
      wallet=ensureWallet(nextWalletId(),walletLabelFromCustomer(c),Math.max(0,Number(c.credit)||0));
      c.accountId=wallet.id;
    }
    if(!wallet.members.includes(c.id))wallet.members.push(c.id);
  });
  DB.wallets.forEach(w=>syncWalletMembers(w.id));
}
normalizeCustomerWalletState();
function saveLocal(){try{localStorage.setItem(STORE_KEY,JSON.stringify(DB));}catch(e){}}
let ALERTS=(()=>{try{const r=localStorage.getItem(ALERTS_KEY);return r?JSON.parse(r):null;}catch(e){return null;}})();
if(!ALERTS){
  try{
    const legacy=localStorage.getItem(LEGACY_ALERTS_KEY);
    if(legacy){
      ALERTS=JSON.parse(legacy);
      localStorage.setItem(ALERTS_KEY,legacy);
    }
  }catch(e){}
}
if(!Array.isArray(ALERTS))ALERTS=[];
function saveAlerts(){try{localStorage.setItem(ALERTS_KEY,JSON.stringify(ALERTS));}catch(e){}}

// GOOGLE SHEETS
// Robust sync layer: queue writes offline and replay when online.
let OUTBOX=(()=>{try{const r=localStorage.getItem(OUTBOX_KEY);return r?JSON.parse(r):null;}catch(e){return null;}})();
if(!OUTBOX){
  try{
    const legacy=localStorage.getItem(LEGACY_OUTBOX_KEY);
    if(legacy){
      OUTBOX=JSON.parse(legacy);
      localStorage.setItem(OUTBOX_KEY,legacy);
    }
  }catch(e){}
}
if(!Array.isArray(OUTBOX))OUTBOX=[];
let outboxFlushTimer=null;
let isFlushingOutbox=false;
window.OUTBOX=OUTBOX;
function saveOutbox(){
  window.OUTBOX=OUTBOX;
  try{localStorage.setItem(OUTBOX_KEY,JSON.stringify(OUTBOX));}catch(e){}
}
function orderSig(o){
  return [
    o.date,
    o.customerId||o.parentName,
    o.product,
    Number(o.qty)||1,
    Number(o.unitPrice)||0,
    Number(o.total)||0,
    o.payment||'Cash',
    o.status||'Paid'
  ].join('|');
}
function rewardSig(r){return [r.date,r.parentName,r.childName,r.type].join('|');}
function applySettingLocally(k,v){
  if(k==='threshold')DB.settings.threshold=Number(v)||10;
  if(k==='loyaltyActive')DB.settings.active=v;
  if(k==='rewardMsg')DB.settings.rewardMsg=v;
  if(k==='promoMsg')DB.settings.promoMsg=v;
  if(k==='notifyEnabled')DB.settings.notifyEnabled=v;
  if(k==='notifyLowStock')DB.settings.notifyLowStock=v;
  if(k==='notifyRewards')DB.settings.notifyRewards=v;
  if(k==='notifyInactive')DB.settings.notifyInactive=v;
  if(k==='googleClientId')DB.settings.googleClientId=String(v||'').trim();
  if(k==='cloudRestorePrompted')DB.settings.cloudRestorePrompted=String(v||'').toLowerCase()==='true';
}
function mergeOutboxIntoDB(){
  OUTBOX.forEach(item=>{
    const p=item.payload||{};
    if(item.action==='addCustomer'){
      const qr=String(p.qrId||'').trim();
      if(!qr||DB.customers.some(c=>String(c.qrId||'').trim()===qr))return;
      DB.customers.push(p);
    }
    if(item.action==='addOrder'){
      const sig=orderSig(p);
      if(DB.orders.some(o=>orderSig(o)===sig))return;
      DB.orders.push(p);
    }
    if(item.action==='logReward'){
      const sig=rewardSig(p);
      if(DB.rewardsLog.some(r=>rewardSig(r)===sig))return;
      DB.rewardsLog.push(p);
    }
    if(item.action==='updateSettings'){
      applySettingLocally(p.key,p.value);
    }
  });
  normalizeCustomerWalletState();
}
function queueOperation(action,payload){
  if(action==='updateSettings'){
    OUTBOX=OUTBOX.filter(i=>!(i.action==='updateSettings'&&i.payload?.key===payload.key));
  }
  if(action==='addCustomer'){
    const qr=String(payload.qrId||'').trim();
    if(OUTBOX.some(i=>i.action==='addCustomer'&&String(i.payload?.qrId||'').trim()===qr))return;
  }
  if(action==='addOrder'){
    const sig=orderSig(payload);
    if(OUTBOX.some(i=>i.action==='addOrder'&&orderSig(i.payload||{})===sig))return;
  }
  if(action==='logReward'){
    const sig=rewardSig(payload);
    if(OUTBOX.some(i=>i.action==='logReward'&&rewardSig(i.payload||{})===sig))return;
  }
  OUTBOX.push({id:String(Date.now())+'-'+Math.random().toString(36).slice(2,7),action,payload,ts:Date.now()});
  saveOutbox();
  mergeOutboxIntoDB();
  saveLocal();
}
function scheduleOutboxFlush(delayMs=OUTBOX_RETRY_MS){
  if(outboxFlushTimer)clearTimeout(outboxFlushTimer);
  outboxFlushTimer=setTimeout(()=>flushOutbox(),delayMs);
}
async function flushOutbox(){
  if(isFlushingOutbox||!OUTBOX.length||!navigator.onLine)return;
  isFlushingOutbox=true;
  setSyncStatus('syncing');
  try{
    while(OUTBOX.length&&navigator.onLine){
      const item=OUTBOX[0];
      await apiCall({action:item.action,data:JSON.stringify(item.payload)});
      OUTBOX.shift();
      saveOutbox();
    }
    setSyncStatus(OUTBOX.length?'error':'ok');
    if(OUTBOX.length)scheduleOutboxFlush();
  }catch(e){
    setSyncStatus('error');
    scheduleOutboxFlush();
  }finally{
    isFlushingOutbox=false;
  }
}

function setSyncStatus(s){const d=document.getElementById('syncDot');d.className='sync-dot'+(s==='ok'?'':' '+s);}
async function apiCall(params){
  const url=SHEETS_URL+'?'+new URLSearchParams(params);
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),API_TIMEOUT_MS);
  try{
    const res=await fetch(url,{signal:ctrl.signal,cache:'no-store'});
    if(!res.ok)throw new Error('API HTTP '+res.status);
    return await res.json();
  }finally{
    clearTimeout(timeout);
  }
}
async function loadFromSheets(background=false){
  if(!background)setLoadMsg('Connecting to Google Sheets...');
  setSyncStatus('syncing');
  try{
    const data=await apiCall({action:'getAll'});
    if(data.customers?.length){
      DB.customers=data.customers.filter(r=>(r.parentName&&String(r.parentName).trim())||(r.childName&&String(r.childName).trim())||(r.displayName&&String(r.displayName).trim())).map((r,i)=>({
        id:'P-'+String(i+1).padStart(3,'0'),
        qrId:String(r.qrId||'CC-P-'+String(i+1).padStart(3,'0')).trim(),
        profileType:normalizeProfileType(r.profileType),
        parentName:String(r.parentName||'').trim(),
        childName:String(r.childName||r.displayName||r.parentName||'').trim(),
        displayName:String(r.displayName||r.childName||r.parentName||'').trim(),
        grade:normalizeGradeValue(r.grade),
        phone:String(r.phone||'').trim(),
        accountId:String(r.accountId||'').trim(),
        credit:Math.max(0,Number(r.credit)||0)
      }));
    }
    if(data.products?.length){
      DB.products=data.products.filter(r=>r.name&&String(r.name).trim()).map((r,i)=>({
        id:'PRD-'+String(i+1).padStart(2,'0'),name:String(r.name).trim(),
        category:String(r.category||'Single').trim(),price:Number(r.price)||0,stock:Number(r.stock)||0
      }));
    }
    if(data.orders?.length){
      DB.orders=data.orders.filter(r=>(r.parentName&&String(r.parentName).trim())||(r.customerName&&String(r.customerName).trim())).map((r,i)=>({
        id:'ORD-'+String(i+1).padStart(4,'0'),date:String(r.date||'').substring(0,10),
        parentName:String(r.parentName||r.customerName||'').trim(),
        customerName:String(r.customerName||r.parentName||'').trim(),
        customerId:String(r.customerId||'').trim(),
        accountId:String(r.accountId||'').trim(),
        product:String(r.product||'').trim(),
        qty:Number(r.qty)||1,unitPrice:Number(r.unitPrice)||0,total:Number(r.total)||0,
        payment:String(r.payment||'Cash').trim(),status:String(r.status||'Paid').trim(),
        creditUsed:Math.max(0,Number(r.creditUsed)||0),
        cashPaid:Math.max(0,Number(r.cashPaid)||Math.max(0,(Number(r.total)||0)-(Number(r.creditUsed)||0)))
      }));
    }
    if(data.settings?.length){
      data.settings.forEach(row=>{
        const k=String(row.key||'').trim(),v=String(row.value||'').trim();
        applySettingLocally(k,v);
      });
    }
    mergeOutboxIntoDB();
    normalizeCustomerWalletState();
    saveLocal();
    setSyncStatus(OUTBOX.length?'syncing':'ok');
    refreshVisibleScreen();
    evaluateOperationalAlerts();
    renderNotifCenter();
    if(!background){
      setLoadMsg('Ready');
      setTimeout(hideLoading,600);
    }
    flushOutbox();
  }catch(err){
    mergeOutboxIntoDB();
    saveLocal();
    setSyncStatus('error');
    refreshVisibleScreen();
    evaluateOperationalAlerts();
    renderNotifCenter();
    if(!background){
      setLoadMsg('Offline - using saved data');
      toast('\u26A1 Using saved local data','rw');
      setTimeout(hideLoading,1200);
    }
    scheduleOutboxFlush();
  }
}
async function pushAction(action,payload,showStatus=true){
  if(showStatus)setSyncStatus('syncing');
  try{
    await apiCall({action,data:JSON.stringify(payload)});
    if(showStatus)setSyncStatus(OUTBOX.length?'syncing':'ok');
    return true;
  }catch(e){
    queueOperation(action,payload);
    if(showStatus)setSyncStatus('error');
    scheduleOutboxFlush();
    return false;
  }
}
async function pushOrder(o){return pushAction('addOrder',o,true);}
async function pushCustomer(c){return pushAction('addCustomer',c,true);}
async function pushSetting(k,v){return pushAction('updateSettings',{key:k,value:v},false);}
async function pushReward(r){return pushAction('logReward',r,false);}
window.addEventListener('online',()=>{
  if(OUTBOX.length)toast('\uD83D\uDFE2 Back online - syncing queued changes','ok');
  flushOutbox();
  evaluateOperationalAlerts();
});
window.addEventListener('offline',()=>{
  setSyncStatus('error');
  toast('\u26A0\uFE0F Offline mode - changes will sync later','rw');
  updateNotifBadge();
});

//  LOADING 
function setLoadMsg(m){document.getElementById('loadingMsg').textContent=m;}
function hideLoading(){const e=document.getElementById('loadingScreen');e.style.opacity='0';e.style.transition='opacity .4s';setTimeout(()=>e.style.display='none',400);}
function refreshVisibleScreen(){
  const active=document.querySelector('.screen.active')?.id||'sc-sell';
  if(active==='sc-sell'){renderRecent();renderLowStockAlert();}
  if(active==='sc-loyalty')renderLoy();
  if(active==='sc-dash')renderDash();
  if(active==='sc-lab')renderLab();
  if(active==='sc-customers')renderCusts();
  if(active==='sc-settings')renderSettings();
  if(active==='sc-broadcast'){renderPromoBrain();updateBroadcastPreview();loadTemplate();}
  if(active==='sc-report'){document.getElementById('reportDate').value=today();renderReport();}
  updateNotifBadge();
}
function primeLocalBoot(){
  renderRecent();
  renderLowStockAlert();
  const wm=document.getElementById('loadingWatermark');
  if(wm){
    wm.classList.remove('out');
  }
  setLoadMsg('Starting Cathdel Creamy...');
  setTimeout(()=>{
    if(wm)wm.classList.add('out');
    setLoadMsg('Connecting to Google Sheets...');
    loadFromSheets(true);
    setTimeout(hideLoading,FAST_BOOT_HIDE_MS);
  },BRAND_SPLASH_MS);
}

// CORE ANALYTICS HELPERS
function escHtml(v){
  return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function parseDateSafe(s){
  if(!s)return null;
  const d=new Date(String(s).substring(0,10)+'T12:00:00');
  return Number.isNaN(d.getTime())?null:d;
}
function daysSince(dateStr){
  const d=parseDateSafe(dateStr);
  if(!d)return 999;
  const now=new Date();
  const ms=now.getTime()-d.getTime();
  return Math.max(0,Math.floor(ms/86400000));
}
function customerOrderKey(cust){
  if(!cust)return '';
  if(cust.id)return 'id:'+String(cust.id).trim();
  return 'name:'+String(cust.parentName||'').trim().toLowerCase();
}
function orderBelongsToCustomer(order,cust){
  if(!order||!cust)return false;
  if(order.customerId&&cust.id)return String(order.customerId)===String(cust.id);
  return String(order.parentName||'').trim().toLowerCase()===String(cust.parentName||'').trim().toLowerCase();
}
function orderCustomerLabel(order){
  if(!order)return 'Customer';
  if(order.customerName&&String(order.customerName).trim())return String(order.customerName).trim();
  if(order.customerId){
    const c=DB.customers.find(x=>String(x.id)===String(order.customerId));
    if(c)return customerDisplayName(c);
  }
  return String(order.parentName||'Customer').trim()||'Customer';
}
function walletForCustomer(cust,autoCreate=false){
  if(!cust)return null;
  let wallet=findWalletById(cust.accountId);
  if(!wallet&&autoCreate){
    wallet=ensureWallet(nextWalletId(),walletLabelFromCustomer(cust),Math.max(0,Number(cust.credit)||0));
    cust.accountId=wallet.id;
    if(!wallet.members.includes(cust.id))wallet.members.push(cust.id);
  }
  return wallet||null;
}
function customerBalance(cust){
  const wallet=walletForCustomer(cust,false);
  if(wallet)return Math.max(0,Number(wallet.balance)||0);
  return Math.max(0,Number(cust?.credit||0));
}
function getCustomerOrderCount(cust,co){
  const map=co||orderCounts();
  const key=customerOrderKey(cust);
  return Number(map[key]||0);
}
function customerOrders(cust){
  return DB.orders.filter(o=>orderBelongsToCustomer(o,cust));
}
function customerSpend(cust){
  return customerOrders(cust).reduce((s,o)=>s+(Number(o.total)||0),0);
}
function customerLastOrder(cust){
  return customerOrders(cust).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null;
}
function customerFavoriteProduct(cust){
  const bag={};
  customerOrders(cust).forEach(o=>{bag[o.product]=(bag[o.product]||0)+(Number(o.qty)||0);});
  const top=Object.entries(bag).sort((a,b)=>b[1]-a[1])[0];
  return top?{name:top[0],qty:top[1]}:null;
}

// PROMO BRAIN + FREE BROADCAST ASSIST
let promoBrainCache={targets:[],segment:'No data',reason:'No customers with phone numbers yet.',generatedAt:0};
function buildPromoBrain(){
  const withPhone=DB.customers.filter(c=>String(c.phone||'').trim());
  if(!withPhone.length){
    return {targets:[],segment:'No data',reason:'Add WhatsApp numbers to customers to unlock recommendations.',generatedAt:Date.now()};
  }
  const threshold=Number(DB.settings.threshold)||10;
  const spendValues=withPhone.map(c=>customerSpend(c));
  const avgSpend=spendValues.length?spendValues.reduce((a,b)=>a+b,0)/spendValues.length:0;
  const scored=withPhone.map(c=>{
    const orders=customerOrders(c);
    const orderCount=orders.length;
    const spend=orders.reduce((s,o)=>s+(Number(o.total)||0),0);
    const last=customerLastOrder(c);
    const inactiveDays=last?daysSince(last.date):999;
    const reasons=[];
    let score=0;
    if(orderCount===0){score+=5;reasons.push('new lead');}
    if(inactiveDays>=ALERT_SCAN_WINDOW_DAYS){score+=4;reasons.push(inactiveDays+'d inactive');}
    if(orderCount>=Math.max(1,threshold-2)&&orderCount<threshold){score+=3;reasons.push('close to reward');}
    if(orderCount>=threshold){score+=1;reasons.push('reward follow-up');}
    if(avgSpend>0&&spend>=avgSpend*1.2){score+=2;reasons.push('high spender');}
    if(score===0){score=1;reasons.push('general promo');}
    return {
      id:c.id,name:customerDisplayName(c),phone:c.phone,score,reasons,
      shortReason:reasons.slice(0,2).join(', '),
      orderCount,spend,inactiveDays
    };
  }).sort((a,b)=>b.score-a.score||b.inactiveDays-a.inactiveDays||b.spend-a.spend);

  let targets=scored.filter(s=>s.score>=4);
  if(!targets.length)targets=scored.slice(0,Math.min(30,scored.length));

  const reasonBuckets={};
  targets.forEach(t=>t.reasons.forEach(r=>{reasonBuckets[r]=(reasonBuckets[r]||0)+1;}));
  const topReason=Object.entries(reasonBuckets).sort((a,b)=>b[1]-a[1])[0]?.[0]||'mixed opportunity';
  const segment=topReason.includes('inactive')?'Win-back audience':topReason.includes('close to reward')?'Near-reward push':'High intent audience';
  return {
    targets,
    segment,
    reason:`${targets.length} customer${targets.length===1?'':'s'} selected. Main signal: ${topReason}.`,
    generatedAt:Date.now()
  };
}
function renderPromoBrain(){
  const summaryEl=document.getElementById('promoBrainSummary');
  const listEl=document.getElementById('promoBrainList');
  const tagEl=document.getElementById('promoBrainTag');
  if(!summaryEl||!listEl||!tagEl)return;
  promoBrainCache=buildPromoBrain();
  summaryEl.textContent=promoBrainCache.reason;
  tagEl.textContent=promoBrainCache.segment;
  if(!promoBrainCache.targets.length){
    listEl.innerHTML='<div class="brain-item"><strong>No targets yet</strong><span>Add customers and sales history.</span></div>';
    return;
  }
  listEl.innerHTML=promoBrainCache.targets.slice(0,5).map(t=>
    `<div class="brain-item"><strong>${escHtml(t.name||'Customer')}</strong><span>${escHtml(t.shortReason)}</span></div>`
  ).join('');
}
function applyPromoBrain(){
  const filter=document.getElementById('bcast-filter');
  if(filter)filter.value='brain';
  updateBroadcastPreview();
  toast('\u2705 Promo Brain targets applied','ok');
}
async function copyTextToClipboard(text,okMsg){
  if(!text){toast('Nothing to copy','er');return false;}
  try{
    if(navigator.clipboard&&window.isSecureContext){
      await navigator.clipboard.writeText(text);
    }else{
      const ta=document.createElement('textarea');
      ta.value=text;
      ta.style.position='fixed';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg||'\u2705 Copied','ok');
    return true;
  }catch(e){
    toast('Copy failed on this browser','er');
    return false;
  }
}
function copyBroadcastMessage(){
  const msg=document.getElementById('bcast-msg')?.value.trim()||'';
  return copyTextToClipboard(msg,'\u2705 Message copied');
}
function copyBroadcastNumbers(){
  const recipients=getRecipients();
  const numbers=recipients.map(c=>String(c.phone||'').replace(/\s+/g,' ').trim()).join('\n');
  return copyTextToClipboard(numbers,`\u2705 ${recipients.length} number${recipients.length===1?'':'s'} copied`);
}
function copyBroadcastPack(){
  const recipients=getRecipients();
  const msg=document.getElementById('bcast-msg')?.value.trim()||'';
  const lines=[
    'Cathdel Creamy Broadcast Pack',
    `Targets: ${recipients.length}`,
    '',
    'Numbers:',
    ...recipients.map(c=>`${customerDisplayName(c)} - ${c.phone}`),
    '',
    'Message:',
    msg
  ];
  return copyTextToClipboard(lines.join('\n'),'\u2705 Broadcast pack copied');
}

//  NAV 
let chartRevenue=null,chartProducts=null,chartGrades=null;
function getRoleTabs(role){
  const r=(role||'owner').toLowerCase();
  if(r==='seller') return ['sell','customers','loyalty','lab','report'];
  if(r==='manager') return ['sell','customers','loyalty','dash','lab','broadcast','report'];
  return ['sell','customers','loyalty','dash','lab','broadcast','report','settings'];
}
function canAccessTab(name){
  return getRoleTabs(DB.settings.role).includes(name);
}
function go(name,btn){
  if(!canAccessTab(name)){
    toast('Access restricted for your role','rw');
    return;
  }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sc-'+name).classList.add('active');
  btn.classList.add('active');
  cancelFlow();
  if(name==='loyalty')  renderLoy();
  if(name==='dash')     renderDash();
  if(name==='lab')      renderLab();
  if(name==='customers')renderCusts();
  if(name==='settings') renderSettings();
  if(name==='sell')     {renderRecent();renderLowStockAlert();}
  if(name==='broadcast'){renderPromoBrain();updateBroadcastPreview();loadTemplate();}
  if(name==='report')   {document.getElementById('reportDate').value=today();renderReport();}
}

//  LOW STOCK ALERT 
function renderLowStockAlert(){
  const thresh=DB.settings.lowStockAt||5;
  const low=DB.products.filter(p=>{
    const sold=DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+o.qty,0);
    return Math.max(0,p.stock-sold)<=thresh;
  });
  const el=document.getElementById('lowStockAlert');
  if(!low.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="alert-banner">
    <h3>&#9888;&#65039; Low Stock Alert (${low.length} item${low.length>1?'s':''})</h3>
    ${low.map(p=>{
      const sold=DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+o.qty,0);
      const rem=Math.max(0,p.stock-sold);
      return `<div class="alert-item"><span>${p.name}</span><span class="badge red">${rem} left</span></div>`;
    }).join('')}
  </div>`;
}

//  QR SCANNER 
let html5QrCode=null;
async function requestCameraAccess(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    return {ok:false,msg:'?? Camera API unavailable on this device/browser.'};
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:'environment'}},
      audio:false
    });
    stream.getTracks().forEach(t=>t.stop());
    return {ok:true};
  }catch(err){
    const text=String(err&&err.message||'').toLowerCase();
    if(text.includes('denied')||text.includes('permission')){
      return {ok:false,msg:'?? Camera permission denied. Use Select Customer.'};
    }
    return {ok:false,msg:'?? Camera unavailable right now. Use Select Customer.'};
  }
}
async function startScan(){
  if(typeof Html5Qrcode==='undefined'){
    toast('\u26A0\uFE0F Scanner unavailable offline. Use Select Customer.','er');
    startFlow('select');
    return;
  }
  if(!window.isSecureContext){
    toast('\uD83D\uDD12 Camera requires HTTPS or installed app mode.','er');
    startFlow('select');
    return;
  }
  const cameraState=await requestCameraAccess();
  if(!cameraState.ok){
    toast(cameraState.msg,'er');
    startFlow('select');
    return;
  }
  if(html5QrCode){
    try{await html5QrCode.stop();}catch(e){}
    html5QrCode=null;
  }
  hide('v-home');show('v-qr');hide('v-select');hide('v-checkout');hide('v-new-customer');
  html5QrCode=new Html5Qrcode('qr-reader');
  html5QrCode.start({facingMode:'environment'},{fps:10,qrbox:{width:200,height:200},aspectRatio:1.0},
    (decoded)=>{html5QrCode.stop().then(()=>{html5QrCode=null;handleScan(decoded);});},
    ()=>{}
  ).catch(()=>{toast('\u26A0\uFE0F Camera denied. Use Select Customer.','er');cancelFlow();});
}
function stopScan(){if(html5QrCode){try{html5QrCode.stop();}catch(e){}html5QrCode=null;}cancelFlow();}
function formatGradeInput(v){
  return normalizeGradeValue(v);
}
function setCustomerTypeUI(prefix){
  const type=(document.getElementById(prefix+'-type')?.value||'child').toLowerCase();
  const nameLabel=document.getElementById(prefix+'-name-label');
  const parentWrap=document.getElementById(prefix+'-parent-wrap');
  const gradeWrap=document.getElementById(prefix+'-grade-wrap');
  const gradeInput=document.getElementById(prefix+'-grade');
  if(nameLabel)nameLabel.textContent=type==='adult'?'Adult Name':'Child Name';
  if(parentWrap)parentWrap.style.display=type==='adult'?'none':'block';
  if(gradeWrap)gradeWrap.style.display=type==='adult'?'none':'block';
  if(type==='adult'&&gradeInput)gradeInput.value='';
}
function renderWalletOptions(prefix){
  const sel=document.getElementById(prefix+'-wallet-existing');
  if(!sel)return;
  const opts=DB.wallets.map(w=>`<option value="${escHtml(String(w.id))}">${escHtml(w.label)} (R${Math.max(0,Number(w.balance)||0)})</option>`);
  sel.innerHTML=opts.length?opts.join(''):'<option value="">No wallets yet</option>';
}
function resetCustomerForm(prefix){
  const defaults={
    type:'child',
    'wallet-mode':'new'
  };
  Object.entries(defaults).forEach(([k,v])=>{
    const el=document.getElementById(prefix+'-'+k);
    if(el)el.value=v;
  });
  ['pname','cname','grade','phone','wallet-name'].forEach(k=>{
    const el=document.getElementById(prefix+'-'+k);
    if(el)el.value='';
  });
  const credit=document.getElementById(prefix+'-credit');
  if(credit)credit.value='0';
}
function toggleWalletMode(prefix){
  const mode=(document.getElementById(prefix+'-wallet-mode')?.value||'new').toLowerCase();
  const newWrap=document.getElementById(prefix+'-wallet-name-wrap');
  const existingWrap=document.getElementById(prefix+'-wallet-existing-wrap');
  if(newWrap)newWrap.style.display=mode==='existing'?'none':'block';
  if(existingWrap)existingWrap.style.display=mode==='existing'?'block':'none';
  if(mode==='existing')renderWalletOptions(prefix);
}
function prepCustomerForm(prefix){
  setCustomerTypeUI(prefix);
  toggleWalletMode(prefix);
}
function createCustomerFromForm(prefix,opts={}){
  const type=normalizeProfileType(document.getElementById(prefix+'-type')?.value||'child');
  const personName=String(document.getElementById(prefix+'-cname')?.value||'').trim();
  const parentName=type==='adult'?'':String(document.getElementById(prefix+'-pname')?.value||'').trim();
  const phoneRaw=String(document.getElementById(prefix+'-phone')?.value||'').trim();
  const phone=(typeof window.formatSouthAfricanPhone==='function'?window.formatSouthAfricanPhone(phoneRaw):phoneRaw);
  const grade=type==='adult'?'':formatGradeInput(document.getElementById(prefix+'-grade')?.value||'');
  const topup=Math.max(0,Number(document.getElementById(prefix+'-credit')?.value||0));
  if(!personName){
    toast(type==='adult'?'Adult name required':'Child name required','er');
    return null;
  }
  if(type==='child'&&!grade){
    toast('Grade number required for child accounts','er');
    return null;
  }
  const mode=(document.getElementById(prefix+'-wallet-mode')?.value||'new').toLowerCase();
  let wallet=null;
  if(mode==='existing'){
    const wid=String(document.getElementById(prefix+'-wallet-existing')?.value||'').trim();
    wallet=findWalletById(wid);
    if(!wallet){
      toast('Select an existing wallet','er');
      return null;
    }
  }else{
    const customLabel=String(document.getElementById(prefix+'-wallet-name')?.value||'').trim();
    const fallback=parentName||personName;
    wallet=ensureWallet(nextWalletId(),customLabel||`${fallback} Wallet`,0);
  }
  const id='P-'+String(DB.customers.length+1).padStart(3,'0');
  const qrId=String(opts.qrId||('CC-P-'+String(DB.customers.length+1).padStart(3,'0')+'-'+Date.now())).trim();
  const cust={
    id,
    qrId,
    profileType:type,
    parentName,
    childName:personName,
    displayName:personName,
    grade,
    phone,
    accountId:String(wallet.id),
    credit:Math.max(0,Number(wallet.balance)||0)
  };
  if(topup>0){
    wallet.balance=Math.max(0,Number(wallet.balance)||0)+topup;
  }
  if(!wallet.members.includes(id))wallet.members.push(id);
  DB.customers.push(cust);
  syncWalletMembers(wallet.id);
  saveLocal();
  pushCustomer(cust);
  // Keep outbox records compact and deterministic.
  const clean=DB.customers.find(c=>c.id===id);
  return clean||cust;
}
function topUpWalletByCustomerId(id){
  const cust=DB.customers.find(c=>String(c.id)===String(id));
  if(!cust){toast('Customer not found','er');return;}
  const wallet=walletForCustomer(cust,true);
  if(!wallet){toast('Wallet not found','er');return;}
  const amountRaw=prompt(`Top up "${wallet.label}" (Current R${Math.max(0,Number(wallet.balance)||0)}):`,'0');
  if(amountRaw===null)return;
  const amount=Math.max(0,Number(amountRaw));
  if(!amount){toast('Enter a valid amount','er');return;}
  wallet.balance=Math.max(0,Number(wallet.balance)||0)+amount;
  syncWalletMembers(wallet.id);
  saveLocal();
  refreshVisibleScreen();
  toast(`✅ Wallet topped up by R${amount}`,'ok');
}
function handleScan(qrId){
  const id=String(qrId||'').trim();
  const found=DB.customers.find(c=>String(c.qrId||'').trim()===id);
  if(found){
    toast(`\uD83D\uDC4B Welcome back, ${customerDisplayName(found)}!`,'ok');
    pickCust(found);
    return;
  }
  hide('v-qr');
  show('v-new-customer');
  resetCustomerForm('nc');
  document.getElementById('nc-qrid').value=id||('CC-'+Date.now());
  prepCustomerForm('nc');
  document.getElementById('nc-cname')?.focus();
}
function registerNewFromScan(){
  const created=createCustomerFromForm('nc',{qrId:document.getElementById('nc-qrid').value||('CC-'+Date.now())});
  if(!created)return;
  resetCustomerForm('nc');
  hide('v-new-customer');
  toast(`\u2705 ${customerDisplayName(created)} registered!`,'ok');
  pickCust(created);
}

//  SELL FLOW 
let selCust=null,selProd=null,qty=1,payment='Cash';
function startFlow(type){
  hide('v-home');
  if(type==='select'){show('v-select');renderStudentList();}
  hide('v-checkout');hide('v-new-customer');
}
function cancelFlow(){
  if(html5QrCode){try{html5QrCode.stop();}catch(e){}html5QrCode=null;}
  selCust=null;selProd=null;qty=1;payment='Cash';
  show('v-home');hide('v-qr');hide('v-select');hide('v-checkout');hide('v-new-customer');
  renderRecent();renderLowStockAlert();
}
function renderStudentList(){
  const q=(document.getElementById('stuSearch')?.value||'').toLowerCase();
  const el=document.getElementById('stuList');
  const co=orderCounts();
  const fx=DB.customers.filter(c=>{
    const blob=[c.parentName,c.childName,c.displayName,c.phone,c.grade,c.profileType].join(' ').toLowerCase();
    return blob.includes(q);
  });
  if(!fx.length){el.innerHTML='<div class="empty" style="padding:20px"><div class="ei">&#128270;</div><p>No customers found</p></div>';return;}
  el.innerHTML=fx.map(c=>{
    const n=getCustomerOrderCount(c,co),done=n>=DB.settings.threshold;
    return `<div class="sitem" onclick='pickCust(${JSON.stringify(c)})'>
      <div><div class="nm">${escHtml(customerDisplayName(c))}</div><div class="sb">${escHtml(customerSubtitle(c))}</div></div>
      <span class="badge ${done?'gold':''}">${done?'&#127881; Reward!':n+' orders'}</span>
    </div>`;
  }).join('');
}
function pickCust(c){
  const full=DB.customers.find(x=>String(x.id)===String(c.id))||c;
  selCust=full;selProd=null;qty=1;
  document.getElementById('coName').textContent=customerDisplayName(full);
  const creditEl=document.getElementById('coCredit');
  if(creditEl)creditEl.textContent='Wallet: R'+customerBalance(full);
  hide('v-qr');hide('v-select');hide('v-home');hide('v-new-customer');show('v-checkout');
  renderProdGrid();updReceipt();
}
function renderProdGrid(){
  document.getElementById('prodGrid').innerHTML=DB.products.map(p=>{
    const sold=DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+o.qty,0);
    const rem=Math.max(0,p.stock-sold);
    return `<div class="prod-card ${selProd?.id===p.id?'sel':''}" onclick='pickProd(${JSON.stringify(p)})'>
      <div class="pe">&#127846;</div><div class="pn">${p.name}</div>
      <div class="pp">R${p.price}</div>
      <div class="ps ${rem<=3?'badge red':''}">${rem<=3?'&#9888;&#65039; ':''}${rem} left</div>
    </div>`;
  }).join('');
}
function pickProd(p){selProd=p;renderProdGrid();updReceipt();}
function adjQty(d){qty=Math.max(1,Math.min(20,qty+d));document.getElementById('qtyDisp').textContent=qty;updReceipt();}
function setPay(el,m){document.querySelectorAll('.pay-opt').forEach(e=>e.classList.remove('sel'));el.classList.add('sel');payment=m;}
function updReceipt(){
  const btn=document.getElementById('recBtn');
  if(!selProd){hide('receiptArea');btn.disabled=true;return;}
  show('receiptArea');
  document.getElementById('r-p').textContent=selProd.name;
  document.getElementById('r-q').textContent=qty+' \u00D7 R'+selProd.price;
  document.getElementById('r-t').textContent='R'+(qty*selProd.price);
  btn.disabled=false;
}
function recordSale(){
  if(!selProd||!selCust)return;
  const currentCust=DB.customers.find(c=>c.id===selCust.id)||selCust;
  const wallet=walletForCustomer(currentCust,true);
  const availableCredit=wallet?Math.max(0,Number(wallet.balance)||0):Math.max(0,Number(currentCust.credit||0));
  const grossTotal=qty*selProd.price;
  const creditUsed=Math.min(availableCredit,grossTotal);
  const cashPaid=Math.max(0,grossTotal-creditUsed);
  const order={id:'ORD-'+String(DB.orders.length+1).padStart(4,'0'),date:today(),
    parentName:customerDisplayName(currentCust),customerName:customerDisplayName(currentCust),
    customerId:String(currentCust.id||''),accountId:String(currentCust.accountId||wallet?.id||''),
    product:selProd.name,qty,unitPrice:selProd.price,
    total:grossTotal,payment,status:'Paid',creditUsed,cashPaid};
  DB.orders.push(order);
  if(wallet){
    wallet.balance=Math.max(0,availableCredit-creditUsed);
    syncWalletMembers(wallet.id);
  }else{
    currentCust.credit=Math.max(0,availableCredit-creditUsed);
  }
  const prod=DB.products.find(p=>p.id===selProd.id);
  if(prod)prod.stock=Math.max(0,prod.stock-qty);
  saveLocal();pushOrder(order);
  const cnt=getCustomerOrderCount(currentCust);
  const cust=currentCust;cancelFlow();
  if(cnt===DB.settings.threshold)showRewardPopup(cust,cnt);
  else{
    const rem=DB.settings.threshold-cnt;
    toast(`\u2705 R${order.total} recorded! Cash R${cashPaid} • Credit R${creditUsed}. ${rem>0?rem+' more to reward':''}`, 'ok');
  }
  evaluateOperationalAlerts();
}
function showRewardPopup(cust,cnt){
  document.getElementById('popSub').textContent=`${customerDisplayName(cust)} has reached ${cnt} purchases!`;
  document.getElementById('popMsg').textContent=DB.settings.rewardMsg;
  const waLink=cust.phone?`https://wa.me/${cust.phone.replace(/\D/g,'')}?text=${encodeURIComponent(DB.settings.rewardMsg)}`:'#';
  const waBtn=document.getElementById('popWaBtn');
  waBtn.href=waLink;
  waBtn.style.display=cust.phone?'flex':'none';
  document.getElementById('rewardOverlay').classList.add('show');
  const reward={date:today(),parentName:customerDisplayName(cust),childName:cust.childName,type:'Free Ice Cream'};
  DB.rewardsLog.push(reward);saveLocal();pushReward(reward);
  addAppAlert('reward',`Reward unlocked: ${customerDisplayName(cust)}`,`${cust.childName||'Customer'} reached ${cnt}/${DB.settings.threshold}.`,`reward-popup:${cust.id}:${today()}`);
}
function closeReward(){document.getElementById('rewardOverlay').classList.remove('show');toast('\uD83C\uDF89 Reward logged!','rw');}
function renderRecent(){
  const el=document.getElementById('recentList');
  const recent=[...DB.orders].reverse().slice(0,10);
  if(!recent.length){el.innerHTML='<div class="empty"><div class="ei">&#128221;</div><h3>No sales yet</h3><p>Tap above to record your first sale!</p></div>';return;}
  el.innerHTML=recent.map(o=>`<div class="sale-item">
    <div><div class="si-name">${escHtml(orderCustomerLabel(o))}</div><div class="si-sub">${escHtml(o.product)} &#215; ${o.qty} &#8226; ${escHtml(o.date)} &#8226; ${escHtml(o.payment)}</div></div>
    <div class="si-amt">R${o.total}</div>
  </div>`).join('');
}

//  LOYALTY 
function renderLoy(){
  const thresh=DB.settings.threshold,co=orderCounts();
  const earned=DB.customers.filter(c=>getCustomerOrderCount(c,co)>=thresh);
  const banDiv=document.getElementById('loyBanners');
  if(earned.length){
    banDiv.innerHTML=`<div class="reward-banner"><h3>&#127881; Ready for Reward (${earned.length})</h3>
      ${earned.map(c=>`<div class="reward-item">
        <div><div style="font-weight:700;font-size:13px">${escHtml(customerDisplayName(c))}</div><div style="font-size:11px;color:var(--text-3)">${escHtml(customerSubtitle(c))}</div></div>
        ${c.phone?`<a class="wa-btn" href="https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(DB.settings.rewardMsg)}" target="_blank">&#128241; WhatsApp</a>`:'<span class="badge">No number</span>'}
      </div>`).join('')}</div>`;
  }else{banDiv.innerHTML='';}
  const listEl=document.getElementById('loyList');
  const sorted=[...DB.customers].sort((a,b)=>getCustomerOrderCount(b,co)-getCustomerOrderCount(a,co));
  if(!sorted.length){listEl.innerHTML='<div class="empty"><div class="ei">&#127942;</div><h3>No customers yet</h3></div>';return;}
  listEl.innerHTML=sorted.map(c=>{
    const n=getCustomerOrderCount(c,co),pct=Math.min(100,Math.round((n/thresh)*100)),done=n>=thresh;
    return `<div class="lrow">
      <div class="lavatar">${escHtml(customerDisplayName(c).charAt(0)||'C')}</div>
      <div class="linfo">
        <div class="ln">${escHtml(customerDisplayName(c))}</div><div class="lc">${escHtml(customerSubtitle(c))}</div>
        ${!done?`<div class="pbar-wrap"><div class="pbar" style="width:${pct}%"></div></div>`:''}
      </div>
      <div class="lright">
        ${done?`<span class="badge gold">&#127881; ${n}/${thresh}</span>`:`<div class="lcount">${n}/${thresh}</div><div class="lsub">purchases</div>`}
        <div style="margin-top:4px"><button class="btn btn-ghost btn-sm" onclick="showLoyaltyCardById('${c.id}')">&#127903; Card</button></div>
      </div>
    </div>`;
  }).join('');
}

//  DIGITAL LOYALTY CARD 
function showLoyaltyCard(cust){
  if(!cust)return;
  const co=orderCounts();
  const n=getCustomerOrderCount(cust,co);
  const thresh=DB.settings.threshold;
  const stamps=Array.from({length:thresh},(_,i)=>`<div class="lc-stamp ${i<n?'filled':''}"><span>${i<n?'&#127846;':'&#9675;'}</span></div>`).join('');
  document.getElementById('loyaltyCardContent').innerHTML=`
    <div class="loyalty-card-wrap">
      <div class="lc-name">${escHtml(customerDisplayName(cust))}</div>
      <div class="lc-child">&#128103; ${escHtml(customerSubtitle(cust))}</div>
      <div class="lc-stamps">${stamps}</div>
      <div class="lc-progress">
        ${n>=thresh?'&#127881; <strong>Reward Earned!</strong> Claim your free ice cream!':
          `<strong>${n}/${thresh}</strong> &#8212; ${thresh-n} more to earn a FREE ice cream`}
      </div>
    </div>
    <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:8px">Screenshot this card and share with the customer!</p>`;
  document.getElementById('loyaltyCardOverlay').classList.add('show');
}
function closeLoyaltyCard(){document.getElementById('loyaltyCardOverlay').classList.remove('show');}

//  PARENT PORTAL 
function showParentPortal(qrId){
  const cust=DB.customers.find(c=>c.qrId===qrId);
  if(!cust){document.getElementById('parentPortalContent').innerHTML='<div class="empty"><div class="ei">&#10067;</div><h3>Customer not found</h3></div>';document.getElementById('parentPortalOverlay').classList.add('show');return;}
  const co=orderCounts();
  const n=getCustomerOrderCount(cust,co),thresh=DB.settings.threshold;
  const pct=Math.min(100,Math.round((n/thresh)*100));
  const stamps=Array.from({length:thresh},(_,i)=>`<div class="lc-stamp ${i<n?'filled':''}" style="width:32px;height:32px;font-size:16px"><span>${i<n?'&#127846;':'&#9675;'}</span></div>`).join('');
  document.getElementById('parentPortalContent').innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <img src="${LOGO_SRC}" style="width:86px;height:52px;object-fit:contain;mix-blend-mode:multiply;filter:drop-shadow(0 6px 12px rgba(15,85,101,.24));margin-bottom:8px">
      <div style="font-family:'Baloo 2','Segoe UI',Tahoma,sans-serif;font-size:18px;font-weight:800;color:var(--teal)">Hi, ${escHtml(customerDisplayName(cust))}! &#128075;</div>
      <div style="font-size:12px;color:var(--text-3)">${escHtml(customerSubtitle(cust))}</div>
    </div>
    <div class="loyalty-card-wrap" style="margin-bottom:0">
      <div class="lc-name">${escHtml(customerDisplayName(cust))}</div>
      <div class="lc-child">&#128103; ${escHtml(cust.childName)}</div>
      <div class="lc-stamps">${stamps}</div>
      <div class="lc-progress">${n>=thresh?'&#127881; <strong>Reward Ready!</strong> You earned a free ice cream!':
        `<strong>${n}/${thresh}</strong> purchases &#8212; ${thresh-n} more to go!`}</div>
    </div>`;
  document.getElementById('parentPortalOverlay').classList.add('show');
}
function closeParentPortal(){document.getElementById('parentPortalOverlay').classList.remove('show');}

//  DASHBOARD + CHARTS 
function renderDash(){
  const paid=DB.orders.filter(o=>o.status==='Paid');
  const tod=today(),todOrd=DB.orders.filter(o=>o.date===tod);
  const co=orderCounts(),thresh=DB.settings.threshold;
  set('d-rev','R'+paid.reduce((s,o)=>s+o.total,0));
  set('d-ord',DB.orders.length);
  set('d-units',DB.orders.reduce((s,o)=>s+o.qty,0));
  set('d-cust',new Set(DB.orders.map(o=>String(o.customerId||('name:'+String(o.parentName||'').trim().toLowerCase())))).size);
  set('d-trev','R'+todOrd.filter(o=>o.status==='Paid').reduce((s,o)=>s+o.total,0));
  set('d-tord',todOrd.length);
  set('d-rearned',Object.values(co).filter(v=>v>=thresh).length);
  set('d-rpend',Object.values(co).filter(v=>v<thresh).length);
  set('d-thresh',thresh+' buys');
  renderRevenueChart();renderProductChart();renderGradeChart();renderStockStatus();renderTopBuyers();renderDashInsights();
}

function getLast7Days(){
  const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0]);}
  return days;
}
function setChartFallback(id,msg){
  const canvas=document.getElementById(id);
  if(!canvas||!canvas.parentElement)return;
  let note=canvas.parentElement.querySelector('.chart-fallback');
  if(!note){
    note=document.createElement('div');
    note.className='chart-fallback';
    canvas.parentElement.appendChild(note);
  }
  note.textContent=msg;
  note.classList.add('show');
}
function clearChartFallback(id){
  const canvas=document.getElementById(id);
  if(!canvas||!canvas.parentElement)return;
  const note=canvas.parentElement.querySelector('.chart-fallback');
  if(note)note.classList.remove('show');
}

function renderRevenueChart(){
  if(typeof Chart==='undefined'){
    setChartFallback('chartRevenue','Charts are unavailable offline until libraries load once online.');
    return;
  }
  clearChartFallback('chartRevenue');
  const days=getLast7Days();
  const labels=days.map(d=>{const dt=new Date(d);return dt.toLocaleDateString('en-ZA',{weekday:'short',day:'numeric'});});
  const data=days.map(d=>DB.orders.filter(o=>o.date===d&&o.status==='Paid').reduce((s,o)=>s+o.total,0));
  const ctx=document.getElementById('chartRevenue').getContext('2d');
  if(chartRevenue)chartRevenue.destroy();
  chartRevenue=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Revenue (R)',data,backgroundColor:'rgba(65,165,185,0.25)',borderColor:'#41A5B9',borderWidth:2,borderRadius:8,hoverBackgroundColor:'rgba(65,165,185,0.45)'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'R'+ctx.raw}}},
    scales:{y:{beginAtZero:true,ticks:{callback:v=>'R'+v},grid:{color:'rgba(65,165,185,0.1)'}},x:{grid:{display:false}}}}});
}

function renderProductChart(){
  if(typeof Chart==='undefined'){
    setChartFallback('chartProducts','Product chart unavailable offline.');
    return;
  }
  clearChartFallback('chartProducts');
  const ctx=document.getElementById('chartProducts').getContext('2d');
  const prods=DB.products.map(p=>({name:p.name,qty:DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+o.qty,0)}));
  if(chartProducts)chartProducts.destroy();
  chartProducts=new Chart(ctx,{type:'doughnut',data:{
    labels:prods.map(p=>p.name),
    datasets:[{data:prods.map(p=>p.qty),backgroundColor:['rgba(65,165,185,0.8)','rgba(235,206,141,0.8)','rgba(45,138,158,0.8)','rgba(174,222,222,0.8)'],borderWidth:2,borderColor:'white'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}}}});
}

let gradeFilter='all';
function renderGradeChart(){
  if(typeof Chart==='undefined'){
    setChartFallback('chartGrades','Grade chart unavailable offline.');
    return;
  }
  clearChartFallback('chartGrades');
  const grades=[...new Set(DB.customers.map(c=>c.grade).filter(Boolean))].sort();
  const chips=document.getElementById('gradeChips');
  chips.innerHTML=[{label:'All',val:'all'},...grades.map(g=>({label:g,val:g}))].map(g=>
    `<div class="grade-chip ${gradeFilter===g.val?'active':''}" onclick="setGradeFilter('${g.val}')">${g.label}</div>`
  ).join('');
  const custByGrade=gradeFilter==='all'?DB.customers:DB.customers.filter(c=>c.grade===gradeFilter);
  const gradeData=grades.map(g=>{
    const custs=DB.customers.filter(c=>c.grade===g);
    return{grade:g,total:custs.reduce((s,c)=>s+(customerOrders(c).reduce((ss,o)=>ss+Number(o.total||0),0)),0)};
  });
  const ctx=document.getElementById('chartGrades').getContext('2d');
  if(chartGrades)chartGrades.destroy();
  chartGrades=new Chart(ctx,{type:'bar',data:{
    labels:gradeData.map(g=>g.grade),
    datasets:[{label:'Revenue (R)',data:gradeData.map(g=>g.total),backgroundColor:'rgba(235,206,141,0.7)',borderColor:'#D4B070',borderWidth:2,borderRadius:8}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'R'+ctx.raw}}},
    scales:{y:{beginAtZero:true,ticks:{callback:v=>'R'+v},grid:{color:'rgba(65,165,185,0.1)'}},x:{grid:{display:false}}}}});
}
function setGradeFilter(v){gradeFilter=v;renderGradeChart();}

function renderStockStatus(){
  document.getElementById('d-stock').innerHTML=DB.products.map(p=>{
    const sold=DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+o.qty,0);
    const rem=Math.max(0,p.stock-sold);
    const [ico,bg,fg]=rem<=0?['&#10060;','#FFF0F0','#C53030']:rem<=(DB.settings.lowStockAt||5)?['&#9888;&#65039;','#FFFBEA','#B7791F']:['&#9989;','#F0FFF4','#276749'];
    return `<div class="srow"><div><div class="sl">${p.name}</div><div class="sd">R${p.price} &#8226; ${sold} sold</div></div><span class="badge" style="background:${bg};color:${fg}">${ico} ${rem} left</span></div>`;
  }).join('');
}
function renderTopBuyers(){
  const co=orderCounts();
  const top=Object.entries(co).sort((a,b)=>b[1]-a[1]).slice(0,5);
  document.getElementById('d-top').innerHTML=top.length
    ?top.map(([nm,n],i)=>`<div class="lrow" style="padding:9px 0">
        <div style="font-family:'Baloo 2','Segoe UI',Tahoma,sans-serif;font-size:17px;color:var(--teal-l);width:22px;font-weight:800">${i+1}</div>
        <div class="linfo"><div class="ln">${nm}</div></div>
        <div style="font-family:'Baloo 2','Segoe UI',Tahoma,sans-serif;font-size:15px;font-weight:700;color:var(--teal)">${n} orders</div>
      </div>`).join('')
    :'<div class="empty" style="padding:20px"><p>No orders yet</p></div>';
}
function renderDashInsights(){
  const host=document.getElementById('dashInsights');
  if(!host)return;
  const now=new Date();
  const revenueForDays=(startOffset,endOffset)=>{
    const from=new Date(now);from.setDate(now.getDate()-startOffset);
    const to=new Date(now);to.setDate(now.getDate()-endOffset);
    return DB.orders.filter(o=>{
      if(o.status!=='Paid')return false;
      const d=parseDateSafe(o.date);
      return d&&d>=from&&d<=to;
    }).reduce((s,o)=>s+(Number(o.total)||0),0);
  };
  const curr7=revenueForDays(6,0);
  const prev7=revenueForDays(13,7);
  const trendPct=prev7>0?Math.round(((curr7-prev7)/prev7)*100):(curr7>0?100:0);
  const trendClass=trendPct<0?'risk':'';
  const trendText=trendPct>=0?`Revenue up ${trendPct}% vs previous 7 days.`:`Revenue down ${Math.abs(trendPct)}% vs previous 7 days.`;

  const threshold=Number(DB.settings.threshold)||10;
  const co=orderCounts();
  const ready=DB.customers.filter(c=>getCustomerOrderCount(c,co)>=threshold).length;
  const close=DB.customers.filter(c=>{const n=getCustomerOrderCount(c,co);return n>=Math.max(1,threshold-2)&&n<threshold;}).length;

  const inactive=DB.customers.filter(c=>{
    const last=customerLastOrder(c);
    const days=last?daysSince(last.date):999;
    return days>=ALERT_SCAN_WINDOW_DAYS;
  }).length;
  const inactiveClass=inactive>0?'warn':'';

  const byProduct={};
  DB.orders.forEach(o=>{byProduct[o.product]=(byProduct[o.product]||0)+(Number(o.qty)||0);});
  const topProduct=Object.entries(byProduct).sort((a,b)=>b[1]-a[1])[0];
  const topProductText=topProduct?`${topProduct[0]} leads with ${topProduct[1]} units sold.`:'No product trend yet.';

  const activeCustomers=new Set(DB.orders.map(o=>String(o.customerId||('name:'+String(o.parentName||'').trim().toLowerCase()))));
  const repeatCustomers=[...activeCustomers].filter(name=>(co[name]||0)>1).length;
  const repeatRate=activeCustomers.size?Math.round((repeatCustomers/activeCustomers.size)*100):0;

  host.innerHTML=[
    `<div class="insight-item ${trendClass}">
      <div class="insight-dot"></div>
      <div><div class="insight-title">${escHtml(trendText)}</div><div class="insight-sub">Last 7 days: R${curr7} | Previous: R${prev7}</div></div>
    </div>`,
    `<div class="insight-item ${inactiveClass}">
      <div class="insight-dot"></div>
      <div><div class="insight-title">${inactive} inactive customer${inactive===1?'':'s'} need a win-back promo.</div><div class="insight-sub">No purchase in ${ALERT_SCAN_WINDOW_DAYS}+ days.</div></div>
    </div>`,
    `<div class="insight-item">
      <div class="insight-dot"></div>
      <div><div class="insight-title">${ready} reward-ready and ${close} near-reward customers.</div><div class="insight-sub">Send reward reminders to increase repeat purchases.</div></div>
    </div>`,
    `<div class="insight-item">
      <div class="insight-dot"></div>
      <div><div class="insight-title">${escHtml(topProductText)}</div><div class="insight-sub">Repeat rate: ${repeatRate}% of active customers.</div></div>
    </div>`
  ].join('');
  const stamp=document.getElementById('dashInsightsTime');
  if(stamp)stamp.textContent='Updated '+new Date().toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
}

// COMMAND CENTER
function formatCurrency(v){return 'R'+Math.round(Number(v)||0);}
function getLastNDates(n){
  const out=[];
  for(let i=n-1;i>=0;i--){
    const d=new Date();
    d.setDate(d.getDate()-i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}
function dailyRevenue(dateStr){
  return DB.orders.filter(o=>o.date===dateStr&&o.status==='Paid').reduce((s,o)=>s+(Number(o.total)||0),0);
}
function calculateBusinessHealth(){
  const totalOrders=DB.orders.length;
  const activeCustomers=new Set(DB.orders.map(o=>String(o.customerId||('name:'+String(o.parentName||'').trim().toLowerCase()))));
  const repeatCustomers=[...activeCustomers].filter(key=>{
    if(String(key).startsWith('name:')){
      const name=String(key).slice(5);
      return DB.orders.filter(o=>String(o.parentName||'').trim().toLowerCase()===name).length>1;
    }
    return DB.orders.filter(o=>String(o.customerId||'')===String(key)).length>1;
  }).length;
  const repeatRate=activeCustomers.size?repeatCustomers/activeCustomers.size:0;
  const phoneCoverage=DB.customers.length?DB.customers.filter(c=>String(c.phone||'').trim()).length/DB.customers.length:0;
  const lowStockCount=DB.products.filter(p=>{
    const sold=DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+Number(o.qty||0),0);
    return Math.max(0,(Number(p.stock)||0)-sold)<=Math.max(1,Number(DB.settings.lowStockAt)||5);
  }).length;
  const stockHealth=DB.products.length?1-(lowStockCount/DB.products.length):1;
  const syncHealth=navigator.onLine?(OUTBOX.length?0.75:1):0.6;
  let score=Math.round((repeatRate*28 + phoneCoverage*22 + stockHealth*25 + syncHealth*25)*100)/100;
  score=Math.max(1,Math.min(99,Math.round(score*100)));
  const label=score>=85?'Excellent operating shape':score>=70?'Strong with minor gaps':score>=55?'Moderate - optimize soon':'High risk - action needed';
  const syncLabel=navigator.onLine?(OUTBOX.length?`${OUTBOX.length} pending sync`:'Sync healthy'):'Offline mode';
  return {score,label,syncLabel};
}
function computeRevenueForecast(){
  const days=getLastNDates(14);
  const values=days.map(d=>dailyRevenue(d));
  const lastVal=values[values.length-1]||0;
  const xMean=(values.length-1)/2;
  const yMean=values.reduce((a,b)=>a+b,0)/(values.length||1);
  let num=0,den=0;
  values.forEach((y,i)=>{num+=(i-xMean)*(y-yMean);den+=(i-xMean)*(i-xMean);});
  const slope=den?num/den:0;
  const forecast=[];
  for(let i=1;i<=7;i++){
    const d=new Date();d.setDate(d.getDate()+i);
    const y=Math.max(0,Math.round(lastVal+slope*i));
    forecast.push({date:d.toISOString().split('T')[0],amount:y});
  }
  return {rows:forecast,total:forecast.reduce((s,r)=>s+r.amount,0)};
}
function computeRestockPlan(){
  const lookbackDays=14;
  const rows=DB.products.map(p=>{
    const sold=DB.orders.filter(o=>o.product===p.name&&daysSince(o.date)<=lookbackDays).reduce((s,o)=>s+Number(o.qty||0),0);
    const avgDaily=sold/lookbackDays;
    const rem=Math.max(0,Number(p.stock)||0);
    const daysCover=avgDaily>0?rem/avgDaily:99;
    const reorder=Math.max(0,Math.ceil((avgDaily*14)-rem));
    return {name:p.name,avgDaily,rem,daysCover,reorder};
  }).sort((a,b)=>a.daysCover-b.daysCover||b.reorder-a.reorder);
  return rows;
}
function buildActionQueue(){
  const actions=[];
  const co=orderCounts();
  const threshold=Number(DB.settings.threshold)||10;
  const rewardReady=DB.customers.filter(c=>getCustomerOrderCount(c,co)>=threshold).length;
  if(rewardReady>0){
    actions.push({title:`Message ${rewardReady} reward-ready customer${rewardReady===1?'':'s'}`,desc:'Use Broadcast -> Reward filter for immediate conversion.'});
  }
  const inactive=DB.customers.filter(c=>{
    const last=customerLastOrder(c);
    return (last?daysSince(last.date):999)>=ALERT_SCAN_WINDOW_DAYS;
  }).length;
  if(inactive>0){
    actions.push({title:`Reactivate ${inactive} inactive account${inactive===1?'':'s'}`,desc:'Run Promo Brain and send a win-back message today.'});
  }
  const low=computeRestockPlan().filter(r=>r.daysCover<=3);
  if(low.length){
    actions.push({title:`Restock ${low.length} low-cover product${low.length===1?'':'s'}`,desc:'Stock may run out within 3 days at current sales speed.'});
  }
  const missingPhones=DB.customers.filter(c=>!String(c.phone||'').trim()).length;
  if(missingPhones>0){
    actions.push({title:`Capture WhatsApp numbers (${missingPhones})`,desc:'Customer contact gaps reduce promo reach and loyalty reminders.'});
  }
  if(!actions.length){
    actions.push({title:'All key metrics stable',desc:'No urgent actions detected. Keep recording sales and monitor trends.'});
  }
  return actions.slice(0,6);
}
function getWeekWindow(){
  const end=today();
  const d=parseDateSafe(end)||new Date();
  d.setDate(d.getDate()-6);
  const start=d.toISOString().slice(0,10);
  return {start,end};
}
function assistantMetrics(){
  const {start,end}=getWeekWindow();
  const todayOrders=dayOrders(today());
  const weekOrders=DB.orders.filter(o=>o.date>=start&&o.date<=end);
  const todayRevenue=todayOrders.reduce((s,o)=>s+Number(o.total||0),0);
  const weekRevenue=weekOrders.reduce((s,o)=>s+Number(o.total||0),0);
  const weekByCustomer={};
  const weekByProduct={};
  weekOrders.forEach(o=>{
    const key=orderCustomerLabel(o);
    weekByCustomer[key]=(weekByCustomer[key]||0)+Number(o.total||0);
    weekByProduct[o.product]=(weekByProduct[o.product]||0)+Number(o.qty||0);
  });
  const topCustomers=Object.entries(weekByCustomer).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const topProduct=Object.entries(weekByProduct).sort((a,b)=>b[1]-a[1])[0];
  const co=orderCounts();
  const threshold=Number(DB.settings.threshold)||10;
  const eligible=DB.customers.filter(c=>getCustomerOrderCount(c,co)>=threshold);
  return {todayOrders,todayRevenue,weekOrders,weekRevenue,topCustomers,topProduct,eligible,threshold};
}
function assistantAnswer(question){
  const q=(question||'').toLowerCase().trim();
  const role=(DB.settings.role||'owner').toLowerCase();
  const m=assistantMetrics();
  const sellerLimited=role==='seller';
  if(!q) return 'Try: "How many sales today?" or use quick buttons.';
  if(q.includes('today')&&(q.includes('sale')||q.includes('sold'))){
    return `Today you recorded ${m.todayOrders.length} sale${m.todayOrders.length===1?'':'s'} totaling ${formatCurrency(m.todayRevenue)}.`;
  }
  if(q.includes('today')&&q.includes('revenue')){
    return `Today's revenue is ${formatCurrency(m.todayRevenue)} from ${m.todayOrders.length} transactions.`;
  }
  if((q.includes('week')||q.includes('weekly'))&&q.includes('revenue')){
    if(sellerLimited) return "Seller mode is limited. I can show today's sales and reward-ready customers.";
    return `Weekly revenue (last 7 days) is ${formatCurrency(m.weekRevenue)} from ${m.weekOrders.length} transactions.`;
  }
  if(q.includes('top')&&q.includes('customer')){
    if(sellerLimited) return "Seller mode is limited. Ask about today's sales or reward customers.";
    if(!m.topCustomers.length) return 'No customer sales recorded this week yet.';
    return 'Top customers this week: '+m.topCustomers.map(([n,v],i)=>`${i+1}. ${n} (${formatCurrency(v)})`).join(' | ');
  }
  if((q.includes('most')||q.includes('top'))&&(q.includes('product')||q.includes('sell'))){
    if(sellerLimited) return "Seller mode is limited. Ask about today's sales or rewards.";
    if(!m.topProduct) return 'No product sales recorded yet.';
    return `${m.topProduct[0]} is currently the most sold product with ${m.topProduct[1]} units this week.`;
  }
  if(q.includes('free')||q.includes('reward')||q.includes('qualif')){
    if(!m.eligible.length) return `No customer has reached the reward threshold (${m.threshold}) yet.`;
    return `Reward-ready customers: ${m.eligible.map(c=>customerDisplayName(c)).join(', ')}.`;
  }
  return `Supported questions: "How many sales today?", "What is today's revenue?", "Weekly revenue", "Top customers this week", "Most sold product", "Who qualifies for a free ice cream?"`;
}
function assistantAppend(text,kind='bot'){
  const host=document.getElementById('assistantChat');
  if(!host)return;
  const row=document.createElement('div');
  row.className='assistant-msg '+kind;
  row.textContent=text;
  host.appendChild(row);
  host.scrollTop=host.scrollHeight;
}
function assistantQuick(type){
  const map={today:'How many sales today?',week:'What is weekly revenue?',loyal:'Who qualifies for a free ice cream?',promo:'Which product sells the most?'};
  const prompt=map[type]||'How many sales today?';
  assistantAppend(prompt,'user');
  assistantAppend(assistantAnswer(prompt),'bot');
}
function askAssistant(){
  const input=document.getElementById('assistantInput');
  const q=(input?.value||'').trim();
  if(!q)return;
  assistantAppend(q,'user');
  assistantAppend(assistantAnswer(q),'bot');
  input.value='';
}
function renderAssistantPanel(){
  const host=document.getElementById('assistantChat');
  if(!host)return;
  if(host.childElementCount)return;
  const role=(DB.settings.role||'owner').toLowerCase();
  const intro=role==='seller'
    ? "Seller mode: ask about today's sales or reward-ready customers."
    : 'Ask anything about sales, revenue, top customers, products, and rewards.';
  assistantAppend(intro,'bot');
}
function renderLab(){
  const scoreEl=document.getElementById('labScore');
  if(!scoreEl)return;
  renderAssistantPanel();
  const health=calculateBusinessHealth();
  set('labScore',health.score);
  set('labScoreLabel',health.label);
  set('labSyncState',health.syncLabel);
  const meter=document.getElementById('labScoreMeter');
  if(meter)meter.style.width=Math.max(4,health.score)+'%';

  const actions=buildActionQueue();
  const actionsEl=document.getElementById('labActions');
  if(actionsEl)actionsEl.innerHTML=actions.map(a=>`<div class="cc-action"><h4>${escHtml(a.title)}</h4><p>${escHtml(a.desc)}</p></div>`).join('');

  const fc=computeRevenueForecast();
  const fcEl=document.getElementById('labForecast');
  if(fcEl){
    fcEl.innerHTML=fc.rows.map(r=>{
      const d=parseDateSafe(r.date);
      const lbl=d?d.toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'}):r.date;
      return `<div class="cc-row"><span>${escHtml(lbl)}</span><strong>${formatCurrency(r.amount)}</strong></div>`;
    }).join('')+`<div class="cc-row"><span style="font-weight:700">Projected 7-day total</span><strong>${formatCurrency(fc.total)}</strong></div>`;
  }

  const rs=computeRestockPlan();
  const rsEl=document.getElementById('labRestock');
  if(rsEl){
    rsEl.innerHTML=rs.slice(0,7).map(r=>`<div class="cc-row"><span>${escHtml(r.name)} (${r.rem} left)</span><strong>${r.reorder>0?`Reorder ${r.reorder}`:'Sufficient'}</strong></div>`).join('');
  }
  runGlobalSearch();
}
function runGlobalSearch(){
  const host=document.getElementById('labSearchResults');
  const q=(document.getElementById('labSearch')?.value||'').trim().toLowerCase();
  if(!host)return;
  if(!q){
    const top=[...DB.orders].reverse().slice(0,5);
    host.innerHTML=top.length?top.map(o=>`<div class="cc-result"><div class="k">Recent Sale</div><div class="v">${escHtml(orderCustomerLabel(o))} - ${escHtml(o.product)} x${Number(o.qty)||1} (${escHtml(o.date)})</div></div>`).join('')
      :'<div class="empty" style="padding:16px"><p>Type to search customers, products, orders and dates.</p></div>';
    return;
  }
  const out=[];
  DB.customers.forEach(c=>{
    const blob=[c.parentName,c.childName,c.displayName,c.grade,c.phone,c.id,c.qrId,c.profileType,c.accountId].join(' ').toLowerCase();
    if(blob.includes(q))out.push({k:'Customer',v:`${customerDisplayName(c)} - ${customerSubtitle(c)}`});
  });
  DB.products.forEach(p=>{
    const blob=[p.name,p.category,p.price,p.stock].join(' ').toLowerCase();
    if(blob.includes(q))out.push({k:'Product',v:`${p.name} | ${formatCurrency(p.price)} | stock ${p.stock}`});
  });
  DB.orders.forEach(o=>{
    const blob=[o.parentName,o.customerName,o.customerId,o.product,o.date,o.payment,o.total,o.qty].join(' ').toLowerCase();
    if(blob.includes(q))out.push({k:'Order',v:`${o.date} - ${orderCustomerLabel(o)} - ${o.product} x${o.qty} (${formatCurrency(o.total)})`});
  });
  if(!out.length){
    host.innerHTML='<div class="empty" style="padding:16px"><p>No matches found.</p></div>';
    return;
  }
  host.innerHTML=out.slice(0,40).map(r=>`<div class="cc-result"><div class="k">${escHtml(r.k)}</div><div class="v">${escHtml(r.v)}</div></div>`).join('');
}
function downloadBlob(filename,content,mime){
  const blob=new Blob([content],{type:mime||'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function csvEscape(v){
  const s=String(v??'');
  if(/[",\n]/.test(s))return '"'+s.replace(/"/g,'""')+'"';
  return s;
}
function exportOrdersCsv(){
  const cols=['id','date','parentName','customerName','customerId','accountId','product','qty','unitPrice','total','payment','status','creditUsed','cashPaid'];
  const rows=DB.orders.map(o=>cols.map(c=>csvEscape(o[c])));
  const csv=[cols.join(','),...rows.map(r=>r.join(','))].join('\n');
  downloadBlob(`cathdel-orders-${today()}.csv`,csv,'text/csv;charset=utf-8');
  toast('\u2705 Orders CSV exported','ok');
}
function exportCustomersCsv(){
  const cols=['id','qrId','profileType','displayName','parentName','childName','grade','phone','accountId','credit'];
  const rows=DB.customers.map(c=>cols.map(k=>csvEscape(c[k])));
  const csv=[cols.join(','),...rows.map(r=>r.join(','))].join('\n');
  downloadBlob(`cathdel-customers-${today()}.csv`,csv,'text/csv;charset=utf-8');
  toast('\u2705 Customers CSV exported','ok');
}
function normalizeImportedDB(raw){
  const base=defaultDB();
  const out={
    settings:{...base.settings,...(raw.settings||{})},
    products:Array.isArray(raw.products)?raw.products:base.products,
    customers:Array.isArray(raw.customers)?raw.customers:base.customers,
    wallets:Array.isArray(raw.wallets)?raw.wallets:base.wallets,
    orders:Array.isArray(raw.orders)?raw.orders:[],
    rewardsLog:Array.isArray(raw.rewardsLog)?raw.rewardsLog:[]
  };
  out.settings.threshold=Math.max(1,Number(out.settings.threshold)||10);
  out.settings.lowStockAt=Math.max(1,Number(out.settings.lowStockAt)||5);
  out.settings.googleClientId=String(out.settings.googleClientId||'').trim();
  out.settings.cloudRestorePrompted=String(out.settings.cloudRestorePrompted||'false').toLowerCase()==='true';
  out.customers=out.customers.map((c,i)=>({
    id:String(c.id||('P-'+String(i+1).padStart(3,'0'))),
    qrId:String(c.qrId||('CC-P-'+String(i+1).padStart(3,'0'))).trim(),
    profileType:normalizeProfileType(c.profileType),
    displayName:String(c.displayName||c.childName||c.parentName||'').trim(),
    parentName:String(c.parentName||'').trim(),
    childName:String(c.childName||'').trim(),
    grade:normalizeGradeValue(c.grade),
    phone:String(c.phone||'').trim(),
    accountId:String(c.accountId||'').trim(),
    credit:Math.max(0,Number(c.credit)||0)
  })).filter(c=>c.displayName||c.childName||c.parentName);
  out.wallets=out.wallets.map((w,i)=>({
    id:String(w.id||('WAL-'+String(i+1).padStart(4,'0'))).trim(),
    label:String(w.label||'Family Wallet').trim()||'Family Wallet',
    balance:Math.max(0,Number(w.balance)||0),
    members:Array.isArray(w.members)?w.members.map(m=>String(m||'').trim()).filter(Boolean):[]
  }));
  out.products=out.products.map((p,i)=>({
    id:String(p.id||('PRD-'+String(i+1).padStart(2,'0'))),
    name:String(p.name||'Product '+(i+1)).trim(),
    category:String(p.category||'Single').trim(),
    price:Number(p.price)||0,
    stock:Number(p.stock)||0
  }));
  out.orders=out.orders.map((o,i)=>({
    id:String(o.id||('ORD-'+String(i+1).padStart(4,'0'))),
    date:String(o.date||today()).substring(0,10),
    parentName:String(o.parentName||o.customerName||'').trim(),
    customerName:String(o.customerName||o.parentName||'').trim(),
    customerId:String(o.customerId||'').trim(),
    accountId:String(o.accountId||'').trim(),
    product:String(o.product||'').trim(),
    qty:Number(o.qty)||1,
    unitPrice:Number(o.unitPrice)||0,
    total:Number(o.total)||0,
    payment:String(o.payment||'Cash').trim(),
    status:String(o.status||'Paid').trim(),
    creditUsed:Math.max(0,Number(o.creditUsed)||0),
    cashPaid:Math.max(0,Number(o.cashPaid)||Math.max(0,(Number(o.total)||0)-(Number(o.creditUsed)||0)))
  })).filter(o=>o.parentName&&o.product);
  return out;
}
function buildBackupPayload(){
  return {
    version:2,
    exportedAt:new Date().toISOString(),
    db:DB,
    alerts:ALERTS,
    outbox:Array.isArray(OUTBOX)?OUTBOX:[]
  };
}
function applyBackupPayload(parsed,sourceLabel='Backup'){
  const incoming=parsed.db&&typeof parsed.db==='object'?parsed.db:parsed;
  DB=normalizeImportedDB(incoming);
  normalizeCustomerWalletState();
  ALERTS=Array.isArray(parsed.alerts)?parsed.alerts:[];
  OUTBOX=Array.isArray(parsed.outbox)?parsed.outbox:[];
  saveLocal();
  saveAlerts();
  saveOutbox();
  setSyncStatus(navigator.onLine?(OUTBOX.length?'syncing':'ok'):'error');
  if(navigator.onLine&&OUTBOX.length)flushOutbox();
  refreshVisibleScreen();
  evaluateOperationalAlerts();
  renderLab();
  prepCustomerForm('c');
  prepCustomerForm('nc');
  toast(`\u2705 ${sourceLabel} imported successfully`,'ok');
}
function downloadBackup(){
  const payload=buildBackupPayload();
  downloadBlob(`cathdel-backup-${today()}.json`,JSON.stringify(payload,null,2),'application/json');
  toast('\u2705 Full backup downloaded','ok');
}
function importBackupFile(evt){
  const file=evt?.target?.files?.[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(String(reader.result||'{}'));
      applyBackupPayload(parsed,'Backup');
    }catch(e){
      toast('Invalid backup file','er');
    }
  };
  reader.readAsText(file);
  evt.target.value='';
}
function runPreHandoverCheck(){
  const lines=[];
  const warns=[];
  const errs=[];
  const qrBag={};
  DB.customers.forEach(c=>{
    const qr=String(c.qrId||'').trim();
    if(!qr){
      errs.push(`Missing QR: ${customerDisplayName(c)} (${c.id})`);
      return;
    }
    qrBag[qr]=(qrBag[qr]||0)+1;
  });
  Object.entries(qrBag).forEach(([qr,count])=>{
    if(count>1)errs.push(`Duplicate QR "${qr}" appears ${count} times`);
  });
  const childWithoutGrade=DB.customers.filter(c=>normalizeProfileType(c.profileType)!=='adult'&&!formatGradeInput(c.grade));
  if(childWithoutGrade.length){
    warns.push(`${childWithoutGrade.length} child account(s) without grade number`);
  }
  const noPhone=DB.customers.filter(c=>!String(c.phone||'').trim()).length;
  if(noPhone)warns.push(`${noPhone} customer(s) without phone number`);
  const noWallet=DB.customers.filter(c=>!walletForCustomer(c,false)).length;
  if(noWallet)errs.push(`${noWallet} customer(s) missing wallet linkage`);
  const pendingSync=(OUTBOX||[]).length;
  if(pendingSync)warns.push(`${pendingSync} unsynced change(s) in outbox`);
  const wallets=DB.wallets||[];
  const emptyWallets=wallets.filter(w=>!Array.isArray(w.members)||!w.members.length).length;
  if(emptyWallets)warns.push(`${emptyWallets} wallet(s) have no linked members`);

  lines.push('Cathdel Creamy Pre-Handover Check');
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Customers: ${DB.customers.length}`);
  lines.push(`Orders: ${DB.orders.length}`);
  lines.push(`Wallets: ${wallets.length}`);
  lines.push(`Outbox pending: ${pendingSync}`);
  lines.push(`Google Client ID configured: ${DB.settings.googleClientId?'YES':'NO'}`);
  lines.push('');
  lines.push(`Errors: ${errs.length}`);
  errs.forEach(x=>lines.push(`- ${x}`));
  lines.push('');
  lines.push(`Warnings: ${warns.length}`);
  warns.forEach(x=>lines.push(`- ${x}`));
  lines.push('');
  lines.push(errs.length?'Status: NOT READY':'Status: READY FOR HANDOVER');

  const report=lines.join('\n');
  downloadBlob(`cathdel-handover-check-${today()}.txt`,report,'text/plain;charset=utf-8');
  alert(report);
  toast(errs.length?'Fix handover issues before delivery':'Handover check passed','ok');
}
function linkGoogleAccount(){
  const current=String(DB.settings.googleClientId||'').trim();
  const entered=prompt('Enter your Google OAuth Client ID (Web client):',current||'');
  if(entered===null)return;
  DB.settings.googleClientId=String(entered||'').trim();
  saveLocal();
  pushSetting('googleClientId',DB.settings.googleClientId);
  toast(DB.settings.googleClientId?'✅ Google client ID saved':'Client ID cleared','ok');
}
function ensureGoogleClientId(interactive=true){
  const id=String(DB.settings.googleClientId||'').trim();
  if(id)return id;
  if(!interactive)return '';
  linkGoogleAccount();
  return String(DB.settings.googleClientId||'').trim();
}
function requestGoogleDriveToken(interactive=true){
  return new Promise((resolve,reject)=>{
    const clientId=ensureGoogleClientId(interactive);
    if(!clientId){
      reject(new Error('Google Client ID is required'));
      return;
    }
    if(!(window.google&&window.google.accounts&&window.google.accounts.oauth2)){
      reject(new Error('Google Identity script not loaded'));
      return;
    }
    googleTokenClient=window.google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:GOOGLE_TOKEN_SCOPE,
      callback:(resp)=>{
        if(resp&&resp.access_token){
          googleAccessToken=resp.access_token;
          resolve(resp.access_token);
        }else{
          reject(new Error('No access token returned'));
        }
      }
    });
    googleTokenClient.requestAccessToken({prompt:interactive?'consent':''});
  });
}
async function driveApi(path,opts={}){
  const token=opts.token||googleAccessToken||await requestGoogleDriveToken(opts.interactive!==false);
  const headers={Authorization:'Bearer '+token,...(opts.headers||{})};
  const res=await fetch('https://www.googleapis.com/drive/v3'+path,{method:opts.method||'GET',headers,body:opts.body||null});
  if(!res.ok){
    const text=await res.text();
    throw new Error(`Drive API ${res.status}: ${text.slice(0,180)}`);
  }
  return opts.parse==='text'?res.text():res.json();
}
async function findCloudBackupFile(token){
  const q=encodeURIComponent(`name='${CLOUD_BACKUP_FILE}' and 'appDataFolder' in parents and trashed=false`);
  const data=await driveApi(`/files?q=${q}&spaces=appDataFolder&fields=files(id,name,modifiedTime,size)`,{token});
  return Array.isArray(data.files)&&data.files.length?data.files[0]:null;
}
async function backupToGoogleAccount(){
  try{
    const token=await requestGoogleDriveToken(true);
    const existing=await findCloudBackupFile(token);
    const payload=JSON.stringify(buildBackupPayload(),null,2);
    const boundary='cathdel_'+Date.now();
    const meta=JSON.stringify({name:CLOUD_BACKUP_FILE,mimeType:'application/json',parents:['appDataFolder']});
    const body=[
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      payload,
      `--${boundary}--`
    ].join('\r\n');
    const url=existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res=await fetch(url,{
      method:existing?'PATCH':'POST',
      headers:{
        Authorization:'Bearer '+token,
        'Content-Type':`multipart/related; boundary=${boundary}`
      },
      body
    });
    if(!res.ok)throw new Error(await res.text());
    toast('✅ Backup saved to Google account','ok');
  }catch(err){
    toast('Google backup failed','er');
    console.error(err);
  }
}
async function restoreFromGoogleAccount(interactive=true){
  try{
    const token=await requestGoogleDriveToken(interactive);
    const existing=await findCloudBackupFile(token);
    if(!existing){
      toast('No Google backup file found','er');
      return;
    }
    const text=await driveApi(`/files/${existing.id}?alt=media`,{token,parse:'text'});
    const parsed=JSON.parse(String(text||'{}'));
    applyBackupPayload(parsed,'Google backup');
  }catch(err){
    toast('Google restore failed','er');
    console.error(err);
  }
}
function maybePromptCloudRestore(){
  if(DB.settings.cloudRestorePrompted)return;
  DB.settings.cloudRestorePrompted=true;
  saveLocal();
  pushSetting('cloudRestorePrompted','true');
  const hasLocalData=DB.orders.length>0||DB.customers.length>3;
  if(hasLocalData)return;
  if(confirm('No local sales data found. Restore once from Google account now?')){
    restoreFromGoogleAccount(true);
  }
}
function undoLastSale(){
  if(!DB.orders.length){
    toast('No sale to undo','er');
    return;
  }
  const last=DB.orders[DB.orders.length-1];
  DB.orders.pop();
  const prod=DB.products.find(p=>p.name===last.product);
  if(prod)prod.stock=Math.max(0,(Number(prod.stock)||0)+(Number(last.qty)||0));
  const sig=orderSig(last);
  OUTBOX=OUTBOX.filter(i=>!(i.action==='addOrder'&&orderSig(i.payload||{})===sig));
  saveOutbox();
  saveLocal();
  refreshVisibleScreen();
  renderLab();
  evaluateOperationalAlerts();
  toast('\u21A9 Last sale reversed locally','rw');
}

//  CUSTOMERS 
function renderCusts(){
  const q=(document.getElementById('custSearch')?.value||'').toLowerCase();
  const co=orderCounts();
  const fx=DB.customers.filter(c=>{
    const blob=[c.parentName,c.childName,c.displayName,c.phone,c.grade,c.profileType,c.accountId].join(' ').toLowerCase();
    return blob.includes(q);
  });
  const el=document.getElementById('custList');
  if(!fx.length){el.innerHTML='<div class="empty"><div class="ei">&#128101;</div><h3>No customers found</h3></div>';return;}
  const threshold=Number(DB.settings.threshold)||10;
  el.innerHTML=fx.map(c=>{
    const n=getCustomerOrderCount(c,co),done=n>=threshold;
    const wallet=walletForCustomer(c,true);
    const walletName=wallet?wallet.label:'Wallet';
    const last=customerLastOrder(c);
    const idle=last?daysSince(last.date):999;
    const action=done?'Reward message':(idle>=ALERT_SCAN_WINDOW_DAYS?'Win-back promo':(n>=Math.max(1,threshold-2)?'Push to reward':'General follow-up'));
    return `<div class="card" style="margin-bottom:10px;padding:15px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-weight:700;font-size:14px">${escHtml(customerDisplayName(c))}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px">${escHtml(customerSubtitle(c))}</div>
          <div style="font-size:11px;color:var(--text-3)">${escHtml(c.phone||'No number')}</div>
          <div style="font-size:11px;color:var(--teal);font-weight:700">${escHtml(walletName)}: R${customerBalance(c)}</div>
          <div style="font-size:10px;color:var(--text-3);margin-top:6px">Next action: ${escHtml(action)}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="badge ${done?'gold':''}">${done?'&#127881; Reward!':n+' orders'}</span>
          <button class="btn btn-ghost btn-sm" onclick="topUpWalletByCustomerId('${c.id}')">Top Up Wallet</button>
          <button class="btn btn-teal btn-sm" onclick="showCustomer360ById('${c.id}')">&#129504; 360 View</button>
          <button class="btn btn-ghost btn-sm" onclick="showQRCodeById('${c.id}')">&#128247; QR Code</button>
          <button class="btn btn-ghost btn-sm" onclick="showLoyaltyCardById('${c.id}')">&#127903; Loyalty Card</button>
          ${c.phone?`<a href="https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(DB.settings.rewardMsg)}" target="_blank" style="font-size:11px;font-weight:700;color:#25D366;text-decoration:none">&#128172; WhatsApp</a>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}
function toggleAddCust(){
  const el=document.getElementById('addCustCard');
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  if(open){
    resetCustomerForm('c');
    prepCustomerForm('c');
  }
}
function saveNewCust(){
  const cust=createCustomerFromForm('c');
  if(!cust)return;
  resetCustomerForm('c');
  toggleAddCust();renderCusts();toast('\u2705 Customer saved!','ok');
  setTimeout(()=>showQRCode(cust),400);
}

//  QR CODE GENERATOR 
function showQRCode(cust,isBlank){
  document.getElementById('qrPopupName').textContent=isBlank?'Blank Activation QR':(customerDisplayName(cust)+' \u2022 '+customerSubtitle(cust));
  const container=document.getElementById('qrCodeDisplay');container.innerHTML='';
  if(typeof QRCode==='undefined'){
    container.innerHTML='<div class=\"empty\" style=\"padding:12px\"><p>QR generator unavailable offline.</p><p style=\"font-size:11px\">ID: '+cust.qrId+'</p></div>';
    document.getElementById('qrOverlay').classList.add('show');
    return;
  }
  new QRCode(container,{text:cust.qrId,width:200,height:200,colorDark:'#41A5B9',colorLight:'#E8F6F6',correctLevel:QRCode.CorrectLevel.H});
  document.getElementById('qrOverlay').classList.add('show');
}
function closeQR(){document.getElementById('qrOverlay').classList.remove('show');}
function findCustomerById(id){return DB.customers.find(c=>String(c.id)===String(id));}
function showQRCodeById(id){
  const cust=findCustomerById(id);
  if(!cust){toast('Customer not found','er');return;}
  showQRCode(cust);
}
function showLoyaltyCardById(id){
  const cust=findCustomerById(id);
  if(!cust){toast('Customer not found','er');return;}
  showLoyaltyCard(cust);
}
function nextBestActionForCustomer(cust,count,inactiveDays){
  const threshold=Number(DB.settings.threshold)||10;
  if(count>=threshold){
    return {
      title:'Reward ready',
      sub:'Send reward confirmation and invite the next purchase streak.',
      msg:DB.settings.rewardMsg
    };
  }
  if(inactiveDays>=ALERT_SCAN_WINDOW_DAYS){
    return {
      title:'Reactivation promo',
      sub:`No purchase in ${inactiveDays} days. Send a win-back offer today.`,
      msg:DB.settings.promoMsg
    };
  }
  if(count>=Math.max(1,threshold-2)){
    return {
      title:'Push to threshold',
      sub:`Only ${threshold-count} purchase${threshold-count===1?'':'s'} left for reward.`,
      msg:'You are so close to a free ice cream! Buy again and unlock your reward.'
    };
  }
  return {
    title:'Nurture relationship',
    sub:'Share a small promo to keep this customer active.',
    msg:DB.settings.promoMsg
  };
}
function showCustomer360ById(id){
  const cust=findCustomerById(id);
  if(!cust){toast('Customer not found','er');return;}
  const wallet=walletForCustomer(cust,true);
  const orders=customerOrders(cust).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const count=orders.length;
  const total=orders.reduce((s,o)=>s+(Number(o.total)||0),0);
  const avg=count?Math.round(total/count):0;
  const last=orders[0]||null;
  const inactiveDays=last?daysSince(last.date):999;
  const fav=customerFavoriteProduct(cust);
  const action=nextBestActionForCustomer(cust,count,inactiveDays);
  const waLink=cust.phone?`https://wa.me/${cust.phone.replace(/\D/g,'')}?text=${encodeURIComponent(action.msg)}`:'#';
  const timeline=orders.slice(0,8).map(o=>{
    const dt=parseDateSafe(o.date);
    const dLabel=dt?dt.toLocaleDateString('en-ZA',{day:'numeric',month:'short'}):o.date;
    return `<div class="timeline-item"><div class="t-left">${escHtml(dLabel)} &#8226; ${escHtml(o.product)} x${Number(o.qty)||1}</div><div class="t-right">R${Number(o.total)||0}</div></div>`;
  }).join('');
  document.getElementById('customer360Content').innerHTML=`
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <div>
        <div style="font-family:'Baloo 2','Segoe UI',Tahoma,sans-serif;font-size:22px;font-weight:800;color:var(--teal)">${escHtml(customerDisplayName(cust))}</div>
        <div style="font-size:12px;color:var(--text-3)">${escHtml(customerSubtitle(cust))}</div>
      </div>
      <span class="badge">${count} orders</span>
    </div>
    <div class="mini-kpis">
      <div class="mini-kpi"><div class="k">R${total}</div><div class="l">Lifetime Spend</div></div>
      <div class="mini-kpi"><div class="k">R${avg}</div><div class="l">Avg Basket</div></div>
      <div class="mini-kpi"><div class="k">${inactiveDays===999?'Never':inactiveDays+'d'}</div><div class="l">Last Activity</div></div>
      <div class="mini-kpi"><div class="k">${escHtml(fav?fav.name:'-')}</div><div class="l">Favorite Product</div></div>
    </div>
    <div style="font-size:11px;color:var(--teal);font-weight:700;margin:2px 0 10px 0">${escHtml(wallet?.label||'Wallet')}: R${Math.max(0,Number(wallet?.balance)||0)} <button class="btn btn-ghost btn-sm" onclick="topUpWalletByCustomerId('${cust.id}')">Top Up</button></div>
    <div class="card" style="margin:0 0 8px 0;padding:12px;border-radius:12px">
      <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px">Next Best Action</div>
      <div style="font-weight:700;color:var(--text);margin-top:2px">${escHtml(action.title)}</div>
      <div style="font-size:12px;color:var(--text-2);margin-top:4px">${escHtml(action.sub)}</div>
      ${cust.phone?`<a href="${waLink}" target="_blank" class="btn btn-wa btn-sm" style="margin-top:8px;text-decoration:none">\uD83D\uDCF2 Message on WhatsApp</a>`:'<div style="font-size:11px;color:var(--text-3);margin-top:6px">No WhatsApp number saved.</div>'}
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--teal);margin-top:10px">Recent Timeline</div>
    <div class="timeline">${timeline||'<div class="empty" style="padding:16px"><p>No sales recorded yet</p></div>'}</div>
  `;
  document.getElementById('customer360Overlay').classList.add('show');
}
function closeCustomer360(){document.getElementById('customer360Overlay').classList.remove('show');}

//  WHATSAPP BROADCAST 
function getRecipients(){
  const filter=document.getElementById('bcast-filter')?.value||'all';
  const co=orderCounts();
  const thresh=DB.settings.threshold;
  const weekAgo=new Date();weekAgo.setDate(weekAgo.getDate()-7);
  const weekAgoStr=weekAgo.toISOString().split('T')[0];
  if(filter==='brain'){
    const pick=(promoBrainCache.targets?.length?promoBrainCache:buildPromoBrain()).targets;
    const ids=new Set(pick.map(t=>String(t.id)));
    return DB.customers.filter(c=>ids.has(String(c.id))&&c.phone);
  }
  return DB.customers.filter(c=>{
    if(!c.phone)return false;
    const n=getCustomerOrderCount(c,co);
    if(filter==='all')return true;
    if(filter==='reward')return n>=thresh;
    if(filter==='close')return n>=Math.max(1,thresh-2)&&n<thresh;
    if(filter==='inactive'){
      const lastOrder=customerOrders(c).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
      return !lastOrder||lastOrder.date<weekAgoStr;
    }
    return true;
  });
}
function loadTemplate(){
  const tmpl=document.getElementById('bcast-template')?.value;
  const msgs={promo:DB.settings.promoMsg,reward:DB.settings.rewardMsg,custom:''};
  document.getElementById('bcast-msg').value=msgs[tmpl]||'';
  updateBroadcastPreview();
}
function updateBroadcastPreview(){
  renderPromoBrain();
  const recipients=getRecipients();
  set('bcastCount',recipients.length);
  const msg=document.getElementById('bcast-msg')?.value||'';
  document.getElementById('bcastPreview').textContent=msg||'Your message will appear here...';
  const label=document.querySelector('.recipient-label');
  if(label){
    const sample=recipients.slice(0,3).map(c=>customerDisplayName(c)).join(', ');
    label.textContent=recipients.length?`Selected: ${sample}${recipients.length>3?' ...':''}`:'No recipients selected';
  }
}
let broadcastQueue=[],broadcastIndex=0,broadcastMessage='',broadcastTargetSig='';
function startBroadcast(){
  const recipients=getRecipients();
  const msg=document.getElementById('bcast-msg').value.trim();
  if(!msg){toast('Please enter a message first','er');return;}
  if(!recipients.length){toast('No recipients match this filter','er');return;}
  const nextSig=recipients.map(c=>c.id).join('|');
  if(nextSig!==broadcastTargetSig||msg!==broadcastMessage||broadcastIndex>=broadcastQueue.length){
    broadcastQueue=recipients;
    broadcastIndex=0;
    broadcastMessage=msg;
    broadcastTargetSig=nextSig;
  }
  sendNextBroadcast(msg);
}
function sendNextBroadcast(msg){
  if(broadcastIndex>=broadcastQueue.length){
    toast(`\u2705 Completed ${broadcastQueue.length} contacts`,'ok');
    broadcastQueue=[];broadcastIndex=0;broadcastMessage='';broadcastTargetSig='';
    return;
  }
  const c=broadcastQueue[broadcastIndex];
  const url=`https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank');
  broadcastIndex++;
  if(broadcastIndex<broadcastQueue.length){
    toast(`\uD83D\uDCF2 Opened ${broadcastIndex}/${broadcastQueue.length}. Tap Open WhatsApp again for next contact.`, 'ok');
  }else{
    toast(`\u2705 Last contact opened (${broadcastQueue.length}/${broadcastQueue.length})`,'ok');
  }
}

//  END OF DAY REPORT 
function renderReport(){
  const date=document.getElementById('reportDate').value||today();
  const dayOrders=DB.orders.filter(o=>o.date===date);
  const el=document.getElementById('reportContent');
  if(!dayOrders.length){
    el.innerHTML=`<div class="card"><div class="empty"><div class="ei">&#128221;</div><h3>No sales on ${date}</h3><p>Pick a different date or record some sales first.</p></div></div>`;
    return;
  }
  const total=dayOrders.reduce((s,o)=>s+o.total,0);
  const cash=dayOrders.filter(o=>o.payment==='Cash').reduce((s,o)=>s+o.total,0);
  const card=dayOrders.filter(o=>o.payment==='Card').reduce((s,o)=>s+o.total,0);
  const eft=dayOrders.filter(o=>o.payment==='EFT').reduce((s,o)=>s+o.total,0);
  const units=dayOrders.reduce((s,o)=>s+o.qty,0);
  const uniqueCust=new Set(dayOrders.map(o=>String(o.customerId||('name:'+String(o.parentName||'').trim().toLowerCase())))).size;
  const byProduct={};
  dayOrders.forEach(o=>{if(!byProduct[o.product])byProduct[o.product]={qty:0,total:0};byProduct[o.product].qty+=o.qty;byProduct[o.product].total+=o.total;});
  el.innerHTML=`<div class="card">
    <div class="report-header">
      <div class="report-logo"><img src="${LOGO_SRC}" style="width:86px;height:52px;object-fit:contain;mix-blend-mode:multiply;filter:drop-shadow(0 6px 12px rgba(15,85,101,.24))"></div>
      <div class="report-title">End of Day Report</div>
      <div class="report-date">${new Date(date+'T12:00:00').toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <div class="report-section">
      <h4>&#128176; Cash-Up Summary</h4>
      <div class="cashup-row"><span class="label">&#128181; Cash</span><span class="amount">R${cash}</span></div>
      <div class="cashup-row"><span class="label">&#128179; Card</span><span class="amount">R${card}</span></div>
      <div class="cashup-row"><span class="label">&#128241; EFT</span><span class="amount">R${eft}</span></div>
      <div class="cashup-row total"><span>TOTAL COLLECTED</span><span>R${total}</span></div>
    </div>
    <div class="report-section">
      <h4>&#128202; Sales Summary</h4>
      <div class="cashup-row"><span class="label">Total Orders</span><span class="amount">${dayOrders.length}</span></div>
      <div class="cashup-row"><span class="label">Units Sold</span><span class="amount">${units}</span></div>
      <div class="cashup-row"><span class="label">Customers</span><span class="amount">${uniqueCust}</span></div>
    </div>
    <div class="report-section">
      <h4>&#127846; By Product</h4>
      ${Object.entries(byProduct).map(([name,d])=>`<div class="cashup-row"><span class="label">${name}</span><span class="amount">${d.qty} sold &#8226; R${d.total}</span></div>`).join('')}
    </div>
    <div class="report-section">
      <h4>&#129534; All Orders</h4>
      ${dayOrders.map(o=>`<div class="cashup-row"><span class="label">${escHtml(orderCustomerLabel(o))}<br><span style="font-size:11px;color:var(--text-3)">${escHtml(o.product)} &#215; ${o.qty} &#8226; ${escHtml(o.payment)}</span></span><span class="amount">R${o.total}</span></div>`).join('')}
    </div>
    <button class="btn btn-ghost" onclick="window.print()" style="margin-top:8px">&#128424;&#65039; Print / Save as PDF</button>
  </div>`;
}

//  SETTINGS 
function renderSettings(){
  document.getElementById('s-thresh').value=DB.settings.threshold;
  document.getElementById('s-active').value=DB.settings.active;
  document.getElementById('s-rmsg').value=DB.settings.rewardMsg;
  document.getElementById('s-pmsg').value=DB.settings.promoMsg;
  document.getElementById('s-lowstock').value=DB.settings.lowStockAt||5;
  document.getElementById('s-notify-enabled').value=DB.settings.notifyEnabled||'YES';
  document.getElementById('s-notify-low').value=DB.settings.notifyLowStock||'YES';
  document.getElementById('s-notify-reward').value=DB.settings.notifyRewards||'YES';
  document.getElementById('s-notify-inactive').value=DB.settings.notifyInactive||'YES';
  updateNotifStatusChip();
  document.getElementById('prodSettings').innerHTML=DB.products.map((p,i)=>
    `<div style="display:flex;gap:7px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <input value="${p.name}" onchange="DB.products[${i}].name=this.value" style="flex:2;min-width:90px;padding:8px 10px;border:2px solid var(--border);border-radius:9px;font-family:'Poppins';font-size:13px;outline:none">
      <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--text-3)">R</span>
        <input type="number" value="${p.price}" onchange="DB.products[${i}].price=+this.value" style="width:58px;padding:8px;border:2px solid var(--border);border-radius:9px;font-family:'Baloo 2','Segoe UI',Tahoma,sans-serif;font-size:14px;font-weight:700;text-align:center;outline:none"></div>
      <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--text-3)">Stock</span>
        <input type="number" value="${p.stock}" onchange="DB.products[${i}].stock=+this.value" style="width:58px;padding:8px;border:2px solid var(--border);border-radius:9px;font-family:'Poppins';font-size:13px;text-align:center;outline:none"></div>
      <button onclick="DB.products.splice(${i},1);renderSettings()" style="padding:8px 10px;border:none;background:#FFF0F0;color:#C53030;border-radius:8px;cursor:pointer;font-size:13px"></button>
    </div>`
  ).join('');
}
function addProd(){DB.products.push({id:'PRD-'+String(DB.products.length+1).padStart(2,'0'),name:'New Product',category:'Single',price:10,stock:20});renderSettings();}
function saveSettings(){
  DB.settings.threshold=parseInt(document.getElementById('s-thresh').value)||10;
  DB.settings.active=document.getElementById('s-active').value;
  DB.settings.rewardMsg=document.getElementById('s-rmsg').value;
  DB.settings.promoMsg=document.getElementById('s-pmsg').value;
  DB.settings.lowStockAt=parseInt(document.getElementById('s-lowstock').value)||5;
  DB.settings.notifyEnabled=document.getElementById('s-notify-enabled').value;
  DB.settings.notifyLowStock=document.getElementById('s-notify-low').value;
  DB.settings.notifyRewards=document.getElementById('s-notify-reward').value;
  DB.settings.notifyInactive=document.getElementById('s-notify-inactive').value;
  saveLocal();
  pushSetting('threshold',DB.settings.threshold);pushSetting('loyaltyActive',DB.settings.active);
  pushSetting('rewardMsg',DB.settings.rewardMsg);pushSetting('promoMsg',DB.settings.promoMsg);
  pushSetting('notifyEnabled',DB.settings.notifyEnabled);
  pushSetting('notifyLowStock',DB.settings.notifyLowStock);
  pushSetting('notifyRewards',DB.settings.notifyRewards);
  pushSetting('notifyInactive',DB.settings.notifyInactive);
  evaluateOperationalAlerts();
  updateNotifStatusChip();
  toast('\u2705 Settings saved!','ok');
}

//  HELPERS 
function orderCounts(){
  const c={};
  DB.orders.forEach(o=>{
    if(o.customerId){
      const idKey='id:'+String(o.customerId).trim();
      c[idKey]=(c[idKey]||0)+1;
      return;
    }
    const nameKey='name:'+String(o.parentName||'').trim().toLowerCase();
    c[nameKey]=(c[nameKey]||0)+1;
  });
  return c;
}
function today(){return new Date().toISOString().split('T')[0];}
function show(id){const e=document.getElementById(id);if(e)e.style.display='block';}
function hide(id){const e=document.getElementById(id);if(e)e.style.display='none';}
function set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
let _tt;
function toast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className='toast up '+type;clearTimeout(_tt);_tt=setTimeout(()=>t.className='toast',3200);}

// NOTIFICATIONS
function notificationCapability(){
  if(!('Notification' in window))return 'unsupported';
  return Notification.permission;
}
function updateNotifBadge(){
  const badge=document.getElementById('notifBadge');
  if(!badge)return;
  const unread=ALERTS.filter(a=>!a.read).length;
  if(unread>0){
    badge.style.display='inline-flex';
    badge.textContent=String(Math.min(99,unread));
  }else{
    badge.style.display='none';
  }
}
function updateNotifStatusChip(){
  const chip=document.getElementById('notifStatusChip');
  if(!chip)return;
  const state=notificationCapability();
  chip.className='badge';
  if(state==='granted'){chip.textContent='Allowed';chip.classList.add('green');}
  else if(state==='denied'){chip.textContent='Blocked';chip.classList.add('red');}
  else if(state==='default'){chip.textContent='Not enabled';}
  else{chip.textContent='Unsupported';chip.classList.add('red');}
}
function formatAlertTime(ts){
  const d=new Date(ts||Date.now());
  return d.toLocaleDateString('en-ZA',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
}
function renderNotifCenter(){
  const list=document.getElementById('notifList');
  if(!list)return;
  if(!ALERTS.length){
    list.innerHTML='<div class="empty" style="padding:22px"><div class="ei">&#128276;</div><h3>No notifications yet</h3><p>Alerts will appear as your app activity grows.</p></div>';
    return;
  }
  list.innerHTML=ALERTS.slice(0,80).map(a=>`<div class="notif-item ${a.read?'':'unread'}">
    <h4>${escHtml(a.title||'Alert')}</h4>
    <p>${escHtml(a.message||'')}</p>
    <div class="meta"><span>${escHtml(a.type||'info')}</span><span>${formatAlertTime(a.ts)}</span></div>
  </div>`).join('');
}
function openNotifCenter(){
  ALERTS=ALERTS.map(a=>({...a,read:true}));
  saveAlerts();
  updateNotifBadge();
  renderNotifCenter();
  document.getElementById('notifOverlay').classList.add('show');
}
function closeNotifCenter(){document.getElementById('notifOverlay').classList.remove('show');}
function clearNotifications(){
  ALERTS=[];
  saveAlerts();
  updateNotifBadge();
  renderNotifCenter();
  toast('\u2705 Notifications cleared','ok');
}
function notifyDevice(title,body){
  if(DB.settings.notifyEnabled!=='YES')return;
  if(notificationCapability()!=='granted')return;
  try{
    new Notification(title,{body,icon:'./icons/icon-192x192.png',badge:'./icons/icon-192x192.png',tag:'cathdel-alert'});
  }catch(e){}
}
function addAppAlert(type,title,message,dedupeKey){
  if(!title||!message)return false;
  if(dedupeKey&&ALERTS.some(a=>a.dedupeKey===dedupeKey))return false;
  ALERTS.unshift({
    id:'AL-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
    type:type||'info',
    title,
    message,
    dedupeKey:dedupeKey||'',
    ts:Date.now(),
    read:false
  });
  if(ALERTS.length>120)ALERTS=ALERTS.slice(0,120);
  saveAlerts();
  updateNotifBadge();
  renderNotifCenter();
  notifyDevice(title,message);
  return true;
}
async function requestNotificationAccess(){
  if(notificationCapability()==='unsupported'){
    toast('This browser does not support notifications','er');
    updateNotifStatusChip();
    return;
  }
  try{
    const perm=await Notification.requestPermission();
    updateNotifStatusChip();
    if(perm==='granted'){
      toast('\u2705 Notifications enabled on this device','ok');
      if(document.getElementById('s-notify-enabled'))document.getElementById('s-notify-enabled').value='YES';
      DB.settings.notifyEnabled='YES';
      saveLocal();
    }else{
      toast('\u26A0\uFE0F Notification permission not granted','rw');
    }
  }catch(e){
    toast('Could not request notification permission','er');
  }
}
function sendTestNotification(){
  const msg='Cathdel Creamy alerts are set up and ready.';
  addAppAlert('system','Notification test',msg,'');
  if(notificationCapability()==='granted')notifyDevice('Cathdel Creamy',msg);
  toast('\u2705 Test alert created','ok');
}
function evaluateOperationalAlerts(){
  if(DB.settings.notifyEnabled!=='YES'){
    updateNotifBadge();
    return;
  }
  const day=today();
  const threshold=Number(DB.settings.threshold)||10;

  if(DB.settings.notifyLowStock==='YES'){
    const lowAt=Number(DB.settings.lowStockAt)||5;
    DB.products.forEach(p=>{
      const sold=DB.orders.filter(o=>o.product===p.name).reduce((s,o)=>s+(Number(o.qty)||0),0);
      const rem=Math.max(0,(Number(p.stock)||0)-sold);
      if(rem<=lowAt){
        addAppAlert('stock',`Low stock: ${p.name}`,`${rem} left. Restock soon to avoid missed sales.`,`stock:${p.id}:${day}`);
      }
    });
  }

  if(DB.settings.notifyRewards==='YES'){
    const co=orderCounts();
    DB.customers.forEach(c=>{
      const n=getCustomerOrderCount(c,co);
      if(n>=threshold){
        addAppAlert('reward',`Reward ready: ${customerDisplayName(c)}`,`${c.childName||'Customer'} is at ${n}/${threshold}. Send reward message.`,`reward:${c.id}:${day}`);
      }
    });
  }

  if(DB.settings.notifyInactive==='YES'){
    const inactive=DB.customers.filter(c=>{
      const last=customerLastOrder(c);
      return (last?daysSince(last.date):999)>=ALERT_SCAN_WINDOW_DAYS;
    });
    if(inactive.length){
      const names=inactive.slice(0,3).map(c=>customerDisplayName(c)).join(', ');
      addAppAlert('inactive','Win-back targets ready',`${inactive.length} inactive customers (${names}${inactive.length>3?', ...':''}).`,`inactive:${day}`);
    }
  }
  updateNotifBadge();
}

//  PWA 
let deferredPrompt=null;
function isStandaloneMode(){
  const mq=window.matchMedia?window.matchMedia('(display-mode: standalone)').matches:false;
  const mqFs=window.matchMedia?window.matchMedia('(display-mode: fullscreen)').matches:false;
  const iosStandalone=window.navigator&&window.navigator.standalone===true;
  return !!(mq||mqFs||iosStandalone);
}
function isIOSLike(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent||'');
}
function refreshInstallButton(){
  const btn=document.getElementById('installBtn');
  if(!btn)return;
  if(isStandaloneMode()){
    btn.style.display='none';
    return;
  }
  if(deferredPrompt||isIOSLike()){
    btn.style.display='flex';
    return;
  }
  btn.style.display='none';
}
if(window.matchMedia){
  const smq=window.matchMedia('(display-mode: standalone)');
  if(smq&&smq.addEventListener)smq.addEventListener('change',refreshInstallButton);
}
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
  refreshInstallButton();
});
window.addEventListener('appinstalled',()=>{
  deferredPrompt=null;
  refreshInstallButton();
  toast('\u2705 App installed! Open it from your home screen.','ok');
});
function installApp(){
  if(isStandaloneMode()){
    toast('\u2705 App already installed on this device','ok');
    return;
  }
  if(deferredPrompt){
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(c=>{
      if(c.outcome==='accepted')toast('\u2705 App installed!','ok');
      deferredPrompt=null;
      refreshInstallButton();
    });
    return;
  }
  if(isIOSLike()){
    toast('\uD83D\uDCF1 iPhone: tap Share then Add to Home Screen','rw');
    return;
  }
  toast('\uD83D\uDCF1 Install option not ready. Reload once and try again.','rw');
}
function verifyRuntimeDependencies(){
  const missing=[];
  if(typeof Html5Qrcode==='undefined')missing.push('scanner');
  if(typeof QRCode==='undefined')missing.push('QR generator');
  if(typeof Chart==='undefined')missing.push('charts');
  if(missing.length){
    toast('\u26A0\uFE0F Limited offline mode: '+missing.join(', ')+' unavailable until online load','rw');
  }
}
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    let reloaded=false;
    navigator.serviceWorker.register('./service-worker.js').then(reg=>{reg.update();}).catch(e=>console.log(e));
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloaded)return;
      reloaded=true;
      window.location.reload();
    });
  });
}


function applyRoleBadge(){
  const b=document.getElementById('roleBadge');
  if(b)b.textContent=(DB.settings.role||'owner').toUpperCase();
  applyRolePermissions();
}
function applyRolePermissions(){
  const allowed=new Set(getRoleTabs(DB.settings.role));
  document.querySelectorAll('.nav .nav-btn').forEach(btn=>{
    const onclick=btn.getAttribute('onclick')||'';
    const m=onclick.match(/go\('([^']+)'/);
    if(!m)return;
    btn.style.display=allowed.has(m[1])?'':'none';
  });
  const active=document.querySelector('.screen.active');
  if(active){
    const name=(active.id||'').replace('sc-','');
    if(!allowed.has(name)){
      const fallback=[...document.querySelectorAll('.nav .nav-btn')]
        .find(b=>(b.getAttribute('onclick')||'').includes("go('sell'"));
      if(fallback)go('sell',fallback);
    }
  }
}
function startOnboard(){
  if(DB.settings.onboarded)return;
  const ov=document.getElementById('onboardOverlay');
  if(!ov)return;
  document.getElementById('obOperator').value=DB.settings.operatorName||'';
  document.getElementById('obRole').value=DB.settings.role||'owner';
  ov.classList.add('show');
}
function finishOnboard(){
  DB.settings.operatorName=document.getElementById('obOperator').value.trim();
  DB.settings.role=document.getElementById('obRole').value;
  DB.settings.onboarded=true;
  saveLocal();
  applyRoleBadge();
  document.getElementById('onboardOverlay').classList.remove('show');
  toast('Setup complete!','ok');
}
function skipOnboard(){
  DB.settings.onboarded=true;
  saveLocal();
  applyRoleBadge();
  document.getElementById('onboardOverlay').classList.remove('show');
}

// Expose runtime API for modular extensions.
Object.assign(window,{
  STORE_KEY,OUTBOX_KEY,OUTBOX,
  DB,saveLocal,show,hide,toast,today,orderCounts,
  canAccessTab,go,applyRolePermissions,saveSettings,startBroadcast,
  handleScan,showQRCode,registerNewFromScan,saveNewCust,pickCust,
  renderLoy,showLoyaltyCard,renderDash,queueOperation,flushOutbox,pushAction,
  assistantAnswer,pushCustomer,pushOrder,pushReward,setSyncStatus,
  topUpWalletByCustomerId,runPreHandoverCheck,
  linkGoogleAccount,backupToGoogleAccount,restoreFromGoogleAccount,
  setCustomerTypeUI,toggleWalletMode,prepCustomerForm,
  customerDisplayName,customerSubtitle
});

//  INIT 
document.getElementById('hdrDate').innerHTML=
  new Date().toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'})+'<br>'+
  new Date().toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
verifyRuntimeDependencies();
setSyncStatus(navigator.onLine?(OUTBOX.length?'syncing':'ok'):'error');
renderNotifCenter();
updateNotifBadge();
updateNotifStatusChip();
evaluateOperationalAlerts();
setInterval(evaluateOperationalAlerts,ALERT_RECHECK_MS);
refreshInstallButton();
applyRoleBadge();
startOnboard();
primeLocalBoot();
resetCustomerForm('c');
resetCustomerForm('nc');
prepCustomerForm('c');
prepCustomerForm('nc');
setTimeout(maybePromptCloudRestore,1800);


