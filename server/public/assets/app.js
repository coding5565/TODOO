'use strict';
/* Xodimlar nazorati: interfeys. Super admin hammasini boshqaradi, xodim faqat o'zinikini kiritadi. */

/* ================= holat ================= */
const emptyS=()=>({emps:[],tasks:[],rules:[],metrics:[],vals:{}});
function norm(j){return{emps:j.emps||[],tasks:j.tasks||[],rules:j.rules||[],metrics:j.metrics||[],vals:j.vals||{}}}
let S=emptyS();
let ME={username:'',role:'admin',empId:null};
let STAFF=[];                       // super admin: xodim akkauntlari
let ready=false,flushing=false,timer=null,failTimer=null,lastSig='';
const dirty=new Set(),known=new Set();
const isAdmin=()=>ME.role==='admin';
let ui={tab:'today',sub:'day',date:today(),stamp:today(),panel:'',menu:false,showBehind:false,
  fEmp:'',fPer:'',fStat:'',addEmp:'',addPer:'day',addRep:false,addDue:'',addOpen:false,metricOpen:false,
  edit:null,del:null,delEmp:null,delRule:null,delMetric:null,editM:null,acct:null,delAcc:null,
  impConfirm:false,impText:'',logRows:null,
  rf:today().slice(0,8)+'01',rt:today()};

const $=s=>document.querySelector(s);
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function empName(id){const e=S.emps.find(e=>e.id===id);return e?e.name:'—'}
function isLate(t){return !t.done&&t.due&&t.due<today()}
function toast(m){const e=$('#toast');e.textContent=m;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,3000)}
function setStatus(kind){
  const e=$('#st');if(!e)return;
  const map={load:['Yuklanmoqda…',''],cloud:['Saqlangan','ok'],saving:['Saqlanmoqda…',''],err:['Saqlanmadi','bad'],off:['Aloqa yo\'q','bad']};
  const[t,c]=map[kind];e.innerHTML=`<span class="t">${t}</span>`;e.className='st '+c;e.title=t;
}

/* ================= server bilan aloqa ================= */
async function api(method,url,body){
  const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'nazorat'},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.status===401){location.replace('/login');throw new Error('unauthorized')}
  return r;
}
async function apiJson(method,url,body){
  const r=await api(method,url,body);let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.error)||'Xatolik ('+r.status+')');
  return j;
}

/* hujjat yo'llari: app/meta, tasks/<oy>_<xodim>, vals/<ko'rsatkich>_<yil> */
const pMeta=()=>'app/meta';
const pTask=t=>'tasks/'+(t.due||today()).slice(0,7)+'_'+t.emp;
const pVal=(mid,date)=>'vals/'+mid+'_'+date.slice(0,4);
function allPaths(){
  const s=new Set([pMeta()]);
  S.tasks.forEach(t=>s.add(pTask(t)));
  Object.keys(S.vals).forEach(mid=>Object.keys(S.vals[mid]).forEach(d=>s.add(pVal(mid,d))));
  return s;
}
function docBody(path){
  const[col,id]=path.split('/');
  if(col==='app')return{emps:S.emps,rules:S.rules,metrics:S.metrics};
  if(col==='tasks'){const month=id.slice(0,7),emp=id.slice(8);
    const items=S.tasks.filter(t=>t.emp===emp&&(t.due||'').slice(0,7)===month);return items.length?{items}:null}
  if(col==='vals'){const k=id.lastIndexOf('_'),mid=id.slice(0,k),yr=id.slice(k+1),d={};
    Object.entries(S.vals[mid]||{}).forEach(([dt,v])=>{if(dt.slice(0,4)===yr)d[dt]=v});
    return Object.keys(d).length?{d}:null}
  return null;
}
function mark(...paths){
  if(!isAdmin())return;
  paths.forEach(p=>dirty.add(p));
  clearTimeout(timer);timer=setTimeout(flush,400);setStatus('saving');
}
function markAll(){mark(...known,...allPaths())}
async function flush(){
  if(flushing)return;
  flushing=true;
  try{
    while(dirty.size){
      const path=dirty.values().next().value,body=docBody(path);
      const[col,id]=path.split('/'),u='/api/doc/'+col+'/'+encodeURIComponent(id);
      if(body===null){if(known.has(path)){const r=await api('DELETE',u);if(!r.ok)throw new Error('http '+r.status);known.delete(path)}}
      else{const r=await api('PUT',u,body);if(!r.ok)throw new Error('http '+r.status);known.add(path)}
      dirty.delete(path);
    }
    setStatus('cloud');
  }catch(e){
    if(String(e&&e.message)==='unauthorized')return;
    setStatus('err');clearTimeout(failTimer);failTimer=setTimeout(flush,6000);
  }finally{flushing=false}
}
async function flushNow(){clearTimeout(timer);await flush()}
window.addEventListener('beforeunload',e=>{if(dirty.size||flushing){e.preventDefault();e.returnValue=''}});

/* super admin: barcha hujjatlarni o'qish */
async function loadAdminState(){
  const[mr,tr,vr]=await Promise.all([api('GET','/api/doc/app/meta'),api('GET','/api/col/tasks'),api('GET','/api/col/vals')]);
  if(!tr.ok||!vr.ok)throw new Error('http '+tr.status);
  const n=emptyS(),kn=new Set();
  if(mr.ok){const m=await mr.json();n.emps=m.emps||[];n.rules=m.rules||[];n.metrics=m.metrics||[];kn.add(pMeta())}
  for(const d of await tr.json()){(d.body.items||[]).forEach(t=>n.tasks.push(t));kn.add('tasks/'+d.id)}
  for(const d of await vr.json()){const k=d.id.lastIndexOf('_'),mid=d.id.slice(0,k);n.vals[mid]=Object.assign(n.vals[mid]||{},d.body.d||{});kn.add('vals/'+d.id)}
  known.clear();kn.forEach(x=>known.add(x));
  return n;
}
/* xodim: faqat o'zining ma'lumotlari */
async function loadStaffState(){
  const j=await apiJson('GET','/api/staff-state');
  const n=emptyS();
  if(j.emp){n.emps=[j.emp];n.metrics=j.metrics||[];n.vals=j.vals||{};n.tasks=j.tasks||[]}
  return n;
}
async function loadStaffList(){
  if(!isAdmin())return;
  try{STAFF=await apiJson('GET','/api/staff')}catch(e){STAFF=[]}
}

/* boshqa qurilmada (yoki xodim tomonidan) kiritilgan o'zgarishlarni olib turish */
async function refresh(){
  if(!ready||document.hidden||dirty.size||flushing)return;
  const a=document.activeElement;
  if(a&&a.closest&&a.closest('#app')&&['INPUT','SELECT','TEXTAREA'].includes(a.tagName)&&!a.readOnly&&a.type!=='checkbox')return;
  try{
    const n=isAdmin()?await loadAdminState():await loadStaffState();
    const sig=JSON.stringify(n);
    if(dirty.size||flushing)return;
    if(sig!==lastSig){lastSig=sig;S=n;if(isAdmin())await loadStaffList();render()}
    else if(today()!==ui.stamp){render()}
  }catch(e){}
  if(today()!==ui.stamp){if(ui.date===ui.stamp)ui.date=today();ui.stamp=today();render()}
}
setInterval(refresh,20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});

/* ================= yorug' / qorong'i rejim ================= */
const THEMES=['auto','dark','light'],THEME_NAME={auto:'avtomatik',dark:'qorong\'i',light:'yorug\''};
function getTheme(){try{const t=localStorage.getItem('nz_theme');return t==='dark'||t==='light'?t:'auto'}catch(e){return'auto'}}
function applyTheme(t){const el=document.documentElement;if(t==='dark'||t==='light')el.setAttribute('data-theme',t);else el.removeAttribute('data-theme')}
function cycleTheme(){
  const n=THEMES[(THEMES.indexOf(getTheme())+1)%3];
  try{localStorage.setItem('nz_theme',n)}catch(e){}
  applyTheme(n);renderMenu();toast('Rejim: '+THEME_NAME[n]);
}

/* ================= sarlavha, menyu ================= */
const ICON={
  today:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  kpi:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  tasks:'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  report:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  emps:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  menu:'<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'
};
const icon=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const TABS=[['today','Bugun','Bugun'],['kpi','Reja','Reja'],['tasks','Topshiriqlar','Topshiriq'],['report','Hisobot','Hisobot'],['emps','Xodimlar','Xodimlar']];
function renderTabs(){
  const t=$('#tabs');
  if(!isAdmin()){t.innerHTML='';t.hidden=true;return}
  t.hidden=false;t.style.setProperty('--n',TABS.length);
  t.innerHTML=TABS.map(([k,n])=>`<button class="tab" data-act="tab" data-v="${k}" ${ui.tab===k?'aria-current="page"':''}>${icon(k)}<span>${n}</span></button>`).join('');
}
function renderMenu(){
  const w=$('#menuwrap');
  $('#menubtn').setAttribute('aria-expanded',ui.menu?'true':'false');
  if(!ui.menu){w.innerHTML='';return}
  const role=isAdmin()?'Super admin':'Xodim';
  w.innerHTML=`<div class="scrim" data-act="menu"></div><div class="menu" role="menu">
    <div class="who">${role}<b>${esc(ME.username)}</b></div><hr>
    ${isAdmin()?`<button role="menuitem" data-act="panel" data-v="log">Faollik tarixi</button><button role="menuitem" data-act="panel" data-v="backup">Zaxira nusxa</button>`:''}
    <button role="menuitem" data-act="panel" data-v="account">Parolni o'zgartirish</button>
    <button role="menuitem" data-act="theme">Rejim: ${THEME_NAME[getTheme()]}</button><hr>
    <button role="menuitem" data-act="logout">Chiqish</button></div>`;
}

/* ================= sana ko'rinishi ================= */
const DOW_FULL=['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
const MON_FULL=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
function dayTitle(d){
  const t=today(),rel=d===t?'Bugun':d===addDays(t,-1)?'Kecha':d===addDays(t,1)?'Ertaga':'',x=pd(d);
  return(rel?rel+', ':'')+x.getDate()+'-'+MON_FULL[x.getMonth()]+' · '+DOW_FULL[x.getDay()];
}

/* ================= topshiriq qatori ================= */
function taskRow(t,showEmp,first){
  const admin=isAdmin(),editing=ui.edit===t.id,asking=ui.del===t.id;
  return `<div class="task ${t.done?'done':''} ${first?'first':''}">
    <input type="checkbox" class="chk" data-act="done" data-id="${t.id}" ${t.done?'checked':''} aria-label="Bajarildi">
    <div class="body">
      <div class="t">${esc(t.title)}</div>
      <div class="meta">
        ${showEmp?`<span>${esc(empName(t.emp))}</span>`:''}
        <span class="pill">${PER[t.per]||''}</span>
        ${t.rule?'<span class="pill rep">takroriy</span>':''}
        ${t.due?`<span class="num ${isLate(t)?'late':''}">${fmt(t.due)}${isLate(t)?' · kechikdi':''}</span>`:''}
        ${t.done&&t.doneAt?`<span class="num okc">bajarildi ${fmt(t.doneAt)}</span>`:''}
      </div>
      ${t.note&&!editing?`<div class="note">Izoh: ${esc(t.note)}</div>`:''}
      ${editing?`<div class="edit">
        <input id="e_title" class="full" value="${esc(t.title)}" maxlength="300" aria-label="Matn">
        <input id="e_note" placeholder="Izoh (masalan: ertaga qiladi)" value="${esc(t.note)}" maxlength="300" aria-label="Izoh">
        <input type="date" id="e_due" value="${t.due||''}" aria-label="Muddat">
        <div class="full row"><button class="btn pri sm" data-act="saveedit" data-id="${t.id}">Saqlash</button>
          <button class="btn sm" data-act="canceledit">Bekor</button></div></div>`:''}
    </div>
    ${admin?`<div class="acts">
      ${editing?'':`<button class="btn ghost sm" data-act="edit" data-id="${t.id}">Tahrir</button>`}
      ${asking?`<button class="btn danger sm" data-act="del2" data-id="${t.id}">Ha, o'chirilsin</button><button class="btn sm" data-act="delno">Yo'q</button>`
              :`<button class="btn ghost sm" data-act="del" data-id="${t.id}">O'chirish</button>`}
    </div>`:''}
  </div>`;
}

/* ================= ko'rsatkich kartochkasi ================= */
/* kunlik: sana; haftalik/oylik: davrning birinchi kuni (faktlar shu kalit bilan saqlanadi) */
function kpiKey(m,d){return isPeriodic(m)?periodRange(m,d).from:d}
/* taxminiy natija uchun: shu davrdagi eski faktlar o'rniga pv qo'yiladi */
function valsWith(m,key,pv){
  const b=Object.assign({},S.vals[m.id]);
  if(isPeriodic(m)){const r=periodRange(m,key);for(const k in b)if(k>=r.from&&k<=r.to)delete b[k]}
  b[key]=pv;return b;
}
/* bu daraja uchun nom: Bugun / hafta oralig'i / oy */
function levelTitle(m,level,d){
  const r=rangeOf(level,d);
  if(level==='day')return d===today()?'Bugun':fmt(d);
  if(level==='week')return fmtD(r.from).slice(0,5)+' – '+fmtD(r.to).slice(0,5);
  return MONTHS_UZ[pd(d).getMonth()]+' '+pd(d).getFullYear();
}
/* reja darajasi kiritish darajasidan kattaroq bo'lsa: shu davrda nechta bajarildi, nechta qoldi */
function progressLine(m,vals,key,t0){
  const b=basisOf(m),e=entryOf(m);
  if(LEVEL_RANK[b]<=LEVEL_RANK[e])return'';
  const lv=levelView(m,vals,b,key,t0);
  if(!lv.active)return'';
  const name=b==='week'?'Hafta':'Oy',lim=lv.limit;
  const state=lim?(lv.over>0?`<b class="warn">limitdan oshgan: +${withUnit(m,lv.over)}</b>`:`qoldi <b>${withUnit(m,lv.left)}</b>`)
                 :(lv.left>0?`qoldi <b>${withUnit(m,lv.left)}</b>`:`<b class="okc">reja bajarildi</b>`);
  return `<div class="kprog num">${name}: ${withUnit(m,lv.done)} / ${withUnit(m,lv.plan)} · ${state}</div>`;
}
function kpiParts(m,d,pv){
  const t0=today(),per=isPeriodic(m),lim=isLimit(m),key=kpiKey(m,d);
  const vals=pv==null?S.vals[m.id]:valsWith(m,key,pv),info=dayInfo(m,vals,key,t0);
  if(info.state!=='ok')return{plan:`<span class="kdetail">${info.state==='before'?'Hali boshlanmagan':'Tugagan'}</span>`,res:'',off:true};
  const r=info.row,future=key>t0,next=per?'Keyingi davr':'Ertangi';
  const label=(lim?'Limit':'Reja');
  const lbl=per?(lim?'Davr limiti':'Davr rejasi'):(key===t0?(lim?'Bugungi limit':'Bugungi reja'):label);
  const detail=r.remDays!==undefined?(r.working?`${lim?'limitdan':'rejadan'} ${fmtN(Math.max(0,r.remain))} qoldi ÷ ${r.remDays} ish kuni`:'dam olish kuni')
    :lim?(r.carryIn>0?`${fmtN(r.base)} limit − ${fmtN(r.carryIn)} oshgani`:(r.working?'limit':'dam olish kuni'))
        :(r.carryIn>0?`${fmtN(r.base)} me'yor + ${fmtN(r.carryIn)} qarz`:(per||r.working?'me\'yor':'dam olish kuni'));
  const plan=`<span class="klabel">${lbl}</span><span class="kbig num">${withUnit(m,r.plan)}</span><span class="kdetail num">${detail}</span>`;
  let res='';
  if(future){res='<div class="kres wait">Kelgusi sana, hali kiritib bo\'lmaydi</div>'}
  else{
    const np=nextPlan(m,vals,key,t0);
    const npTxt=np?`${next} ${lim?'limit':'reja'}: <b class="num">${withUnit(m,np.plan)}</b>`:'';
    if(r.actual==null){
      const carryTxt=lim?(r.carryOut>0?` · ${per?'keyingi davr':'ertangi'} limitdan <b class="num">${withUnit(m,r.carryOut)}</b> ayriladi`:''):`, <b class="num">${withUnit(m,r.carryOut)}</b> ${per?'keyingi davrga':'ertaga'} o'tdi`;
      res=r.missing?`<div class="kres warn"><span>Kiritilmagan, 0 deb olindi${carryTxt}</span></div>`
                   :`<div class="kres wait">${per?'Davr oxirida jami sonni kiriting':'Hali kiritilmagan'}</div>`;
    }else if(r.diff>=0){
      res=lim?`<div class="kres ok"><span><b>Limit ichida</b>${r.diff>0?` · qoldi <span class="num">${withUnit(m,r.diff)}</span>`:''}${npTxt?` · ${npTxt}`:''}</span></div>`
             :`<div class="kres ok"><span><b>Reja bajarildi</b>${r.surplus>0?` · ortiqcha <span class="num">+${withUnit(m,r.surplus)}</span>`:''}${npTxt?` · ${npTxt}`:''}</span></div>`;
    }else{
      res=lim?`<div class="kres warn"><span><b>Limitdan oshdi: <span class="num">+${withUnit(m,-r.diff)}</span></b>${npTxt?` · ${npTxt}`:''}</span></div>`
             :`<div class="kres warn"><span><b>Yetmadi: <span class="num">${withUnit(m,-r.diff)}</span></b>${npTxt?` · ${npTxt}`:''}</span></div>`;
    }
    if(pv!=null)res=res.replace('class="kres ','class="kres prev ').replace('<span>','<span>Taxminan: ');
    res+=progressLine(m,vals,key,t0);
  }
  return{plan,res,off:future,actual:r.actual};
}
/* kiritiladigan darajadan farqli bo'limlarda: avtomatik hisoblangan ko'rinish (faqat o'qish uchun) */
function levelCard(m,level,d){
  const t0=today(),entry=entryOf(m),lim=isLimit(m),lv=levelView(m,S.vals[m.id],level,d,t0);
  const coarser=LEVEL_RANK[level]>LEVEL_RANK[entry],word=(lim?'limit':'reja'),unit=m.unit?' '+esc(m.unit):'';
  const when=entry==='week'?'hafta oxirida kiritiladi':entry==='month'?'oy oxirida kiritiladi':'har kuni kiritiladi';
  if(!coarser){
    return `<div class="vitem"><div class="vline"><b>${esc(m.name)}</b> · ${level==='day'?'kuniga':'haftasiga'} ${word} <b class="num">≈ ${fmtN(Math.round(lv.plan*100)/100)}${unit}</b> <span class="mute">(${when})</span></div></div>`;
  }
  const pct=lv.plan>0?Math.min(100,Math.round(lv.done/lv.plan*100)):0;
  const state=lim?(lv.over>0?`<b class="warn">Limitdan oshgan: +${withUnit(m,lv.over)}</b>`:`Qoldi <b>${withUnit(m,lv.left)}</b>`)
                 :(lv.left>0?`Qoldi <b>${withUnit(m,lv.left)}</b>`:`<b class="okc">Reja bajarildi</b>${lv.over>0?` · ortiqcha +${withUnit(m,lv.over)}`:''}`);
  const perDay=lv.daysLeft>0&&lv.left>0?` · ${lv.daysLeft} ish kuni qoldi, kuniga ≈ ${fmtN(Math.round(lv.perDay*100)/100)}${unit}`:'';
  return `<div class="vitem"><div class="khead"><span class="kname">${esc(m.name)}</span><span class="kpill">${esc(levelTitle(m,level,d))}</span></div>
    <div class="vbig2 num">${withUnit(m,lv.done)} <span class="mute">/ ${withUnit(m,lv.plan)} ${word}</span></div>
    <div class="bar"><i style="width:${pct}%;${lim&&lv.over>0?'background:var(--warn)':''}"></i></div>
    <div class="vline num">${state}${perDay}</div></div>`;
}

function kpiRow(m,d,old){
  const per=isPeriodic(m),key=kpiKey(m,d),id=m.id+'_'+key;
  const p=kpiParts(m,key),cur=getVal(m,S.vals[m.id],key),saved=cur!==undefined;
  return `<div class="kitem" data-krow="${id}">
    <div class="khead"><span class="kname">${esc(m.name)}</span>${per?`<span class="kpill ${old?'old':''}">${old?'o\'tgan davr · ':''}${esc(periodLabel(m,key))}</span>`:''}</div>
    <div class="kbody">
      <div class="kplan" data-part="plan">${p.plan}</div>
      <div class="kinput"><input id="in_${id}" class="kin num" inputmode="decimal" autocomplete="off" aria-label="${per?'Davr jami fakti':'Fakt'}" data-mid="${m.id}" data-date="${key}" value="${fmtIn(cur)}" ${p.off?'disabled':''} ${saved?'readonly':''} placeholder="0">
        <span class="kunit">${esc(m.unit||'')}</span>
        <button class="btn ${saved?'':'pri'}" data-act="kconfirm" data-mid="${m.id}" data-date="${key}" ${p.off?'disabled':''}>${saved?'O\'zgartirish':'Tasdiqlash'}</button></div>
    </div>
    <div data-part="res">${p.res}</div></div>`;
}
function daysText(days){
  const s=[...days].sort((a,b)=>DOW_ORDER.indexOf(a)-DOW_ORDER.indexOf(b));
  if(s.length===7)return'har kuni';
  const idx=s.map(x=>DOW_ORDER.indexOf(x));
  if(idx.every((v,i)=>v===i)&&s.length>1)return DOW[s[0]]+'–'+DOW[s[s.length-1]];
  return s.map(x=>DOW[x]).join(', ');
}
function activeMetrics(emp,d,kind){
  return S.metrics.filter(m=>{
    if(m.emp!==emp||(kind&&kindOf(m)!==kind))return false;
    if(isPeriodic(m)){const r=periodRange(m,d);return r.to>=m.start&&(!m.end||r.from<=m.end)}
    return d>=m.start&&(!m.end||d<=m.end);
  });
}
/* shu daraja (kunlik/haftalik/oylik) davrida faol bo'lgan, lekin boshqa darajada kiritiladigan ko'rsatkichlar */
function derivedMetrics(emp,d,level){
  const r=rangeOf(level,d);
  return S.metrics.filter(m=>m.emp===emp&&kindOf(m)!==level&&r.to>=m.start&&(!m.end||r.from<=m.end));
}
/* haftalik/oylik: o'tgan, lekin kiritilmagan davrlar (oxirgi 4 ta) */
function missingPrev(m,d){
  if(!isPeriodic(m))return[];
  const cur=periodRange(m,d).from;
  return calcPeriods(m,S.vals[m.id],cur,today()).filter(r=>r.missing&&r.date<cur).slice(-4).map(r=>r.date);
}
const subKeys=(m,d)=>isPeriodic(m)?[kpiKey(m,d),...missingPrev(m,d)]:[d];
function subCount(kind,d){
  const t0=today();
  if(kind==='tasks')return S.tasks.filter(t=>(t.due===d||(d===t0&&isLate(t)))&&!t.done).length;
  if(d>t0)return 0;
  let n=0;
  S.emps.forEach(e=>activeMetrics(e.id,d,kind).forEach(m=>{
    const per=isPeriodic(m);
    subKeys(m,d).forEach((k,i)=>{
      if(getVal(m,S.vals[m.id],k)!==undefined)return;
      if(per&&i===0&&d<addDays(periodRange(m,d).to,-1))return;   // joriy hafta/oy faqat oxirgi 2 kunda hisoblanadi
      n++;
    });
  }));
  return n;
}
function monthFrom(m,d){const f=d.slice(0,8)+'01';return f<m.start?m.start:f}
/* kunlik: oy boshidan; haftalik/oylik: ko'rsatkich boshlanganidan hozirgi davrgacha */
function statFor(m,d,t0){
  return isPeriodic(m)?periodStat(m,S.vals[m.id],periodRange(m,m.start).from,periodRange(m,d).from,t0)
                      :periodStat(m,S.vals[m.id],monthFrom(m,d),d,t0);
}
function behindBox(d,kind){
  const t0=today();if(d>t0||!isAdmin())return'';
  const items=[];
  S.emps.forEach(e=>activeMetrics(e.id,d,kind).forEach(m=>{const st=statFor(m,d,t0);if(st.gap<0)items.push({e,m,st})}));
  const any=S.emps.some(e=>activeMetrics(e.id,d,kind).length);
  if(!any)return'';
  if(!items.length)return `<div class="behind okb"><span>Hammasi reja bo'yicha, limitlar ichida</span></div>`;
  items.sort((a,b)=>a.st.gap-b.st.gap);
  return `<button class="behind" data-act="behind"><span>${items.length} ta ko'rsatkich e'tibor talab qiladi</span><span>${ui.showBehind?'Yopish':'Ko\'rish'}</span></button>`
    +(ui.showBehind?`<div class="behindlist">${items.map(x=>`<div class="br"><span><b>${esc(x.e.name)}</b> · ${esc(x.m.name)}</span><span class="warn num"><b>${x.st.limit?'+':'−'}${withUnit(x.m,-x.st.gap)}</b> <span class="mute small">${x.st.limit?'limitdan oshgan':'ortda'}</span></span></div>`).join('')}</div>`:'');
}
const SUB_HINT={week:'Hafta oxirida bir marta, haftalik jami sonni kiriting. Kunlik kiritiladiganlarning haftalik natijasi pastda o\'zi chiqadi.',month:'Oy oxirida bir marta, oylik jami sonni kiriting. Kunlik kiritiladiganlarning oylik natijasi pastda o\'zi chiqadi.'};

function vToday(){
  const d=ui.date,t0=today(),isToday=d===t0,sub=ui.sub,admin=isAdmin();
  const taskList=S.tasks.filter(t=>t.due===d||(isToday&&isLate(t)));
  const SUBS=[['day','Kunlik'],['week','Haftalik'],['month','Oylik'],['tasks','Topshiriq']];
  const bar=`<div class="datebar"><button class="ic" data-act="dayshift" data-v="-1" aria-label="Oldingi kun">‹</button>
      <button class="datebtn" data-act="pickdate" aria-label="Sanani tanlash">${esc(dayTitle(d))}<input type="date" id="dpick" value="${d}" tabindex="-1" aria-hidden="true"></button>
      <button class="ic" data-act="dayshift" data-v="1" aria-label="Keyingi kun">›</button></div>
    ${isToday?'':'<div class="row" style="justify-content:center;margin-top:-4px"><button class="btn sm ghost" data-act="gotoday">Bugunga qaytish</button></div>'}
    <div class="seg" role="tablist" aria-label="Bo'lim">${SUBS.map(([k,n])=>{const c=subCount(k,d);
      return `<button class="segb ${sub===k?'on':''}" role="tab" aria-selected="${sub===k}" data-act="sub" data-v="${k}">${n}${c?`<span class="badge">${c}</span>`:''}</button>`}).join('')}</div>
    ${SUB_HINT[sub]?`<p class="hint">${SUB_HINT[sub]}</p>`:''}`;
  const cards=S.emps.map(e=>{
    if(sub==='tasks'){
      const ts=taskList.filter(t=>t.emp===e.id).sort((a,b)=>a.done-b.done||(a.due||'').localeCompare(b.due||''));
      if(!ts.length)return'';
      const k=ts.filter(t=>t.done).length;
      return `<section class="card"><div class="group-h"><h2>${admin?esc(e.name):'Topshiriqlar'}</h2><span class="num mute small">${k} / ${ts.length}</span></div>
        <div class="bar"><i style="width:${k/ts.length*100}%"></i></div>${ts.map((t,i)=>taskRow(t,false,i===0)).join('')}</section>`;
    }
    const ms=activeMetrics(e.id,d,sub),dm=derivedMetrics(e.id,d,sub);
    if(!ms.length&&!dm.length)return'';
    return `<section class="card">${admin?`<div class="group-h"><h2>${esc(e.name)}</h2></div>`:''}${ms.map(m=>subKeys(m,d).map((k,i)=>kpiRow(m,k,i>0)).join('')).join('')}
      ${dm.length?`<div class="derived"><div class="lbl" style="margin:${ms.length?'14':'0'}px 0 4px">Avtomatik hisoblangan</div>${dm.map(m=>levelCard(m,sub,d)).join('')}</div>`:''}</section>`;
  }).join('');
  const empty=sub==='tasks'
    ?`<section class="card empty"><b>${isToday?'Bugun':'Bu kun'} topshiriq yo'q</b>${admin?'"+ Topshiriq" tugmasi bilan qo\'shing yoki boshqa kunni tanlang.':'Boshqa kunni tanlab ko\'ring.'}</section>`
    :`<section class="card empty"><b>${KIND_NAME[sub]} ko'rsatkich yo'q</b>${admin?`"Reja" bo'limida ${sub==='day'?'kunlik me\'yor':sub==='week'?'haftalik reja':'oylik reja'} belgilang.
       <div class="row"><button class="btn pri" data-act="tab" data-v="kpi">Reja belgilash</button></div>`:'Admin sizga hali ko\'rsatkich belgilamagan.'}</section>`;
  const addB=admin&&sub==='tasks'&&S.emps.length?`<div class="row" style="justify-content:flex-end"><button class="btn pri" data-act="addopen">${ui.addOpen?'Yopish':'+ Topshiriq'}</button></div>`:'';
  let top='';
  if(!admin&&S.emps[0])top=`<h1 style="margin:4px 4px 0;font-size:24px;letter-spacing:-.02em">Salom, ${esc(S.emps[0].name.split(' ')[0])}!</h1>`;
  $('#app').innerHTML=top+bar+(sub==='tasks'?addB+addForm():'')+(sub==='tasks'?'':behindBox(d,sub))
    +(S.emps.length?(cards||empty):(admin?'':'<section class="card empty"><b>Ma\'lumot topilmadi</b>Admin bilan bog\'laning.</section>'))
    +(admin?sampleOffer():'');
  bindForm();
}

function sampleOffer(){
  if(S.emps.length||S.tasks.length)return'';
  return `<section class="card empty"><b>Boshlaymiz</b>Avval xodim qo'shing, keyin unga reja va topshiriq bering. Yoki dastur qanday ishlashini namuna bilan ko'ring.
    <div class="row"><button class="btn pri" data-act="tab" data-v="emps">Xodim qo'shish</button><button class="btn" data-act="sample">Namuna ko'rish</button></div></section>`;
}

/* ================= topshiriq qo'shish ================= */
function addForm(){
  if(!isAdmin())return'';
  if(!S.emps.length)return `<section class="card empty"><b>Avval xodim qo'shing</b>Topshiriq berish uchun kamida bitta xodim kerak.<div class="row"><button class="btn pri" data-act="tab" data-v="emps">Xodim qo'shish</button></div></section>`;
  if(!ui.addOpen)return'';
  const emp=ui.addEmp&&S.emps.some(e=>e.id===ui.addEmp)?ui.addEmp:S.emps[0].id;
  return `<section class="card"><h2>Yangi topshiriq</h2><div class="formgrid">
    <div class="field full"><label class="lbl" for="a_title">Nima qilishi kerak?</label><input id="a_title" placeholder="Masalan: kassa hisobotini topshirish" maxlength="300"></div>
    <div class="field"><label class="lbl" for="a_emp">Kimga</label><select id="a_emp">${S.emps.map(e=>`<option value="${e.id}" ${e.id===emp?'selected':''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field"><label class="lbl" for="a_due">Muddati</label><input type="date" id="a_due" value="${ui.addDue||ui.date||today()}"></div>
    <div class="field"><label class="lbl" for="a_per">Turi</label><select id="a_per">${Object.entries(PER).map(([k,v])=>`<option value="${k}" ${ui.addPer===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <label class="field inline" style="align-self:end;height:44px"><input type="checkbox" id="a_rep" ${ui.addRep?'checked':''}> Takrorlansin</label>
    <div class="full row"><button class="btn pri" data-act="add">Qo'shish</button><button class="btn" data-act="addopen">Yopish</button>
      <span class="mute small" id="a_hint">${ui.addRep?'Shu muddatdan boshlab '+REP[ui.addPer]+' o\'zi paydo bo\'ladi.':''}</span></div>
  </div></section>`;
}
function bindForm(){
  const m=$('#a_emp');if(!m)return;
  m.onchange=e=>ui.addEmp=e.target.value;
  $('#a_per').onchange=e=>{ui.addPer=e.target.value;updHint()};
  $('#a_rep').onchange=e=>{ui.addRep=e.target.checked;updHint()};
  $('#a_due').onchange=e=>{if(e.target.value)ui.addDue=e.target.value};
  $('#a_title').onkeydown=e=>{if(e.key==='Enter')addTask()};
}
function updHint(){const h=$('#a_hint');if(h)h.textContent=ui.addRep?"Shu muddatdan boshlab "+REP[ui.addPer]+" o'zi paydo bo'ladi.":''}
function addTask(){
  const title=$('#a_title').value.trim();
  if(!title){$('#a_title').focus();return}
  const emp=$('#a_emp').value,per=$('#a_per').value,due=$('#a_due').value||today();
  let rule;
  if(ui.addRep){rule=uid();S.rules.push({id:rule,emp,title,rep:per,start:due,skip:[]})}
  const t={id:uid(),emp,title,per,due,done:false,doneAt:'',note:'',rule};
  S.tasks.push(t);
  ui.addEmp=emp;mark(pTask(t),pMeta());render();toast('Topshiriq qo\'shildi');
  const el=$('#a_title');if(el)el.focus();
}

/* ================= Reja (ko'rsatkichlar) ================= */
function dayChecks(sel,prefix){
  return `<div class="days">${DOW_ORDER.map(x=>`<label><input type="checkbox" class="${prefix}" value="${x}" ${sel.includes(x)?'checked':''}> ${DOW[x]}</label>`).join('')}</div>`;
}
function derivedFromForm(){
  const b=(document.querySelector('input[name=m_basis]:checked')||{}).value||'day';
  const tg=parseNum(($('#m_target')||{}).value||'');
  const days=readDays('mday');
  if(tg.empty||tg.bad||tg.v<=0||!days.length)return'';
  const m={basis:b,entry:b,mode:'target',unit:(($('#m_unit')||{}).value||'').trim(),days,start:today(),targets:[{from:today(),v:tg.v}]};
  const parts=derivedParts(m,today()).filter((x,i)=>['day','week','month'][i]!==b);
  const wd=wdCount(days,rangeOf('month',today()).from,rangeOf('month',today()).to);
  return `Avtomatik hisoblanadi: ${parts.join(' · ')} <span class="mute">(shu oyda ${wd} ish kuni)</span>`;
}
function vKpi(){
  const t0=today();
  const open=ui.metricOpen||!S.metrics.length;
  const form=!S.emps.length?`<section class="card empty"><b>Avval xodim qo'shing</b><div class="row"><button class="btn pri" data-act="tab" data-v="emps">Xodim qo'shish</button></div></section>`:
  (!open?`<div class="row" style="justify-content:space-between"><h1 style="margin:0;font-size:22px;letter-spacing:-.02em">Reja va limitlar</h1><button class="btn pri" data-act="metricopen">+ Yangi</button></div>`:
  `<section class="card"><h2>Yangi reja yoki limit</h2>
    <div class="formgrid">
      <div class="field"><label class="lbl" for="m_emp">Kimga</label><select id="m_emp">${S.emps.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="lbl" for="m_name">Nomi</label><input id="m_name" placeholder="Masalan: Pul tushumi, Leadlar" maxlength="60"></div>
      <div class="field full"><span class="lbl">Nima bu?</span>
        <div class="kindpick two" role="radiogroup">
          <label><input type="radio" name="m_mode" value="target" checked>Reja<small>kamida shuncha qilish kerak</small></label>
          <label><input type="radio" name="m_mode" value="limit">Limit<small>shundan oshmasligi kerak</small></label></div></div>
      <div class="field"><label class="lbl" id="m_tl" for="m_target">Qancha?</label><input id="m_target" inputmode="decimal" placeholder="masalan: 7"></div>
      <div class="field"><label class="lbl" for="m_unit">Nimada o'lchanadi?</label><input id="m_unit" placeholder="mln, ta, so'm" maxlength="12"></div>
      <div class="field full"><span class="lbl">Shu miqdor qaysi muddat uchun?</span>
        <div class="kindpick" role="radiogroup">
          <label><input type="radio" name="m_basis" value="day" checked>Kuniga</label>
          <label><input type="radio" name="m_basis" value="week">Haftasiga</label>
          <label><input type="radio" name="m_basis" value="month">Oyiga</label></div></div>
      <div class="field full"><span class="lbl">Ish kunlari (qolgan muddatlar shunga qarab hisoblanadi)</span>${dayChecks([1,2,3,4,5,6],'mday')}</div>
      <p class="derivedbox full" id="m_derived" style="margin:0" hidden></p>
      <div class="field full"><span class="lbl">Sonni qachon kiritasiz?</span>
        <div class="kindpick" role="radiogroup">
          <label><input type="radio" name="m_entry" value="day" checked>Har kuni</label>
          <label><input type="radio" name="m_entry" value="week">Hafta oxirida</label>
          <label><input type="radio" name="m_entry" value="month">Oy oxirida</label></div></div>
      <div class="field"><label class="lbl" for="m_start">Qaysi kundan boshlab</label><input type="date" id="m_start" value="${t0}"></div>
      <div class="field"><label class="lbl" id="m_ol" for="m_open">Hozirgi qarz (bo'lsa)</label><input id="m_open" inputmode="decimal" placeholder="0"></div>
      <p class="hint full" id="m_ohint" style="margin:0">Shu kungacha yig'ilgan, yopilmagan miqdor. Masalan 12 yozsangiz va kunlik reja 7 bo'lsa, birinchi kunning rejasi 19 bo'ladi.</p>
      <div class="full row"><button class="btn pri" data-act="addmetric">Qo'shish</button>${S.metrics.length?'<button class="btn" data-act="metricopen">Yopish</button>':''}</div>
    </div></section>`);
  const list=S.emps.map(e=>{
    const ms=S.metrics.filter(m=>m.emp===e.id);if(!ms.length)return'';
    const groups=['day','week','month'].map(k=>{const g=ms.filter(m=>kindOf(m)===k);
      return g.length?`<h3>${KIND_NAME[k]} kiritiladi</h3>`+g.map((m,i)=>metricRow(m,i===0,t0)).join(''):''}).join('');
    return `<section class="card"><h2>${esc(e.name)}</h2>${groups}</section>`;
  }).join('');
  $('#app').innerHTML=form+(list||(S.emps.length&&!open?`<section class="card empty"><b>Hali reja yo'q</b>"+ Yangi" tugmasi bilan birinchisini qo'shing.</section>`:''))+sampleOffer();
  if(open&&$('#m_derived'))updDerived();
}
function updDerived(){
  const el=$('#m_derived');if(!el)return;
  const t=derivedFromForm();el.hidden=!t;el.innerHTML=t;
}
function metricRow(m,first,t0){
  const cur=targetOn(m,t0),editing=ui.editM===m.id,ended=m.end&&m.end<t0;
  const rows=calc(m,S.vals[m.id],t0,t0).filter(r=>!r.pending);
  const debt=rows.length?rows[rows.length-1].carryOut:Number(m.open)||0;
  return `<div class="task ${first?'first':''}"><div class="body">
    <div class="t"><b>${esc(m.name)}</b> ${isLimit(m)?'<span class="pill warnp">limit</span>':''} <span class="mute">· ${planLabel(m,t0)} · ${daysText(m.days)}</span></div>
    <div class="meta"><span class="num">${derivedParts(m,t0).join(' · ')}</span></div>
    <div class="meta"><span>${fmtD(m.start)} dan${m.end?' '+fmtD(m.end)+' gacha':''}</span>
      ${ended?'<span class="pill">tugagan</span>':''}
      ${debt>0?`<span class="late num">qarz: ${withUnit(m,debt)}</span>`:''}
      ${m.targets.length>1?`<span>me'yor tarixi: ${m.targets.map(x=>fmtN(x.v)+' ('+fmtD(x.from)+')').join(' → ')}</span>`:''}</div>
    ${editing?`<div class="formgrid" style="margin-top:12px">
      <div class="field"><label class="lbl" for="x_name">Nomi</label><input id="x_name" value="${esc(m.name)}" maxlength="60"></div>
      <div class="field"><label class="lbl" for="x_unit">Birlik</label><input id="x_unit" value="${esc(m.unit)}" maxlength="12"></div>
      <div class="field"><label class="lbl" for="x_target">Yangi miqdor (${basisOf(m)==='week'?'haftasiga':basisOf(m)==='month'?'oyiga':'kuniga'})</label><input id="x_target" inputmode="decimal" value="${fmtIn(cur)}"></div>
      <div class="field"><label class="lbl" for="x_from">Qaysi sanadan</label><input type="date" id="x_from" value="${t0}"></div>
      <div class="field full"><span class="lbl">Ish kunlari</span>${dayChecks(m.days,'xday')}</div>
      <div class="full row"><button class="btn pri sm" data-act="savemetric" data-id="${m.id}">Saqlash</button><button class="btn sm" data-act="cancelm">Bekor</button>
        <span class="mute small">Me'yor o'zgarsa, eski kunlar hisobi o'zgarmaydi.</span></div></div>`:''}
  </div><div class="acts">
    ${editing?'':`<button class="btn ghost sm" data-act="editm" data-id="${m.id}">Tahrir</button>`}
    ${ended?`<button class="btn ghost sm" data-act="resumem" data-id="${m.id}">Davom ettirish</button>`:`<button class="btn ghost sm" data-act="stopm" data-id="${m.id}">To'xtatish</button>`}
    ${ui.delMetric===m.id?`<button class="btn danger sm" data-act="delm2" data-id="${m.id}">Ha, natijalari bilan o'chirilsin</button><button class="btn sm" data-act="delno">Yo'q</button>`
      :`<button class="btn ghost sm" data-act="delm" data-id="${m.id}">O'chirish</button>`}
  </div></div>`;
}
function readDays(cls){return[...document.querySelectorAll('.'+cls+':checked')].map(x=>Number(x.value))}
function addMetric(){
  const val=n=>(document.querySelector('input[name='+n+']:checked')||{}).value;
  const mode=val('m_mode')==='limit'?'limit':'target',basis=val('m_basis')||'day',entry=val('m_entry')||'day';
  const name=$('#m_name').value.trim(),tg=parseNum($('#m_target').value),op=parseNum($('#m_open').value),days=readDays('mday'),start=$('#m_start').value||today();
  if(!name){toast('Nomini yozing');$('#m_name').focus();return}
  if(tg.empty||tg.bad||tg.v<=0){toast('Miqdorni to\'g\'ri raqam bilan yozing');$('#m_target').focus();return}
  if(op.bad){toast('Qarz noto\'g\'ri yozilgan');return}
  if(!days.length){toast('Kamida bitta ish kunini belgilang');return}
  S.metrics.push({id:uid(),emp:$('#m_emp').value,name,unit:$('#m_unit').value.trim(),mode:mode==='limit'?'limit':undefined,basis,entry,kind:entry==='day'?undefined:entry,targets:[{from:start,v:tg.v}],days,start,end:'',open:op.v||0});
  ui.metricOpen=false;mark(pMeta());render();toast(mode==='limit'?'Limit qo\'shildi':'Reja qo\'shildi');
}
function saveMetric(id){
  const m=S.metrics.find(x=>x.id===id);if(!m)return;
  const name=$('#x_name').value.trim(),tg=parseNum($('#x_target').value),days=readDays('xday'),from=$('#x_from').value||today();
  if(!name||tg.empty||tg.bad||tg.v<=0||!days.length){toast('Nom, miqdor va ish kunlarini tekshiring');return}
  m.name=name;m.unit=$('#x_unit').value.trim();m.days=days;
  const cur=targetOn(m,from),ex=m.targets.find(x=>x.from===from);
  if(ex)ex.v=tg.v;else if(tg.v!==cur)m.targets.push({from,v:tg.v});
  m.targets.sort((a,b)=>a.from.localeCompare(b.from));
  ui.editM=null;mark(pMeta());render();toast('Saqlandi');
}

/* ================= faktni kiritish ================= */
/* S ni yangilaydi, o'zgargan hujjat yo'llarini qaytaradi */
function applyVal(m,date,p){
  S.vals[m.id]=S.vals[m.id]||{};
  const marks=[pVal(m.id,date)];
  if(isPeriodic(m)){ // davr uchun bitta jami son: eski kunlik yozuvlar bo'lsa, ular qo'shilib ketadi
    const r=periodRange(m,date);
    for(const k of Object.keys(S.vals[m.id]))if(k>=r.from&&k<=r.to&&k!==date){delete S.vals[m.id][k];marks.push(pVal(m.id,k))}
  }
  if(p.empty)delete S.vals[m.id][date];else S.vals[m.id][date]=p.v;
  return marks;
}
async function setVal(mid,date,raw){
  const m=S.metrics.find(x=>x.id===mid);if(!m)return false;
  const p=parseNum(raw);
  if(p.bad){toast('Faqat musbat raqam yozing');return false}
  if(isAdmin()){mark(...applyVal(m,date,p));return true}
  try{await apiJson('POST','/api/staff-val',{mid,key:date,value:p.empty?null:p.v});applyVal(m,date,p);return true}
  catch(e){toast(e.message);return false}
}
function refreshKpi(mid,date,pv){
  const m=S.metrics.find(x=>x.id===mid),row=document.querySelector('[data-krow="'+mid+'_'+date+'"]');
  if(!m||!row)return;
  const p=kpiParts(m,date,pv);
  row.querySelector('[data-part="plan"]').innerHTML=p.plan;
  row.querySelector('[data-part="res"]').innerHTML=p.res;
}
async function confirmK(btn){
  const mid=btn.dataset.mid,date=btn.dataset.date,row=btn.closest('[data-krow]'),inp=row.querySelector('.kin');
  if(inp.readOnly){inp.readOnly=false;inp.focus();inp.select();btn.textContent='Tasdiqlash';btn.classList.add('pri');return}
  const m=S.metrics.find(x=>x.id===mid),p=parseNum(inp.value),had=m&&getVal(m,S.vals[mid],date)!==undefined;
  if(p.bad){toast('Faqat musbat raqam yozing');inp.focus();return}
  if(p.empty&&!had){toast('Sonni yozing. Hech narsa bo\'lmasa 0 yozing');inp.focus();return}
  const ids=[...document.querySelectorAll('.kin')].map(i=>i.id),me=inp.id;
  btn.disabled=true;
  const ok=await setVal(mid,date,inp.value);
  if(!ok){btn.disabled=false;return}
  render();toast(p.empty?'O\'chirildi':'Tasdiqlandi');
  for(let k=ids.indexOf(me)+1;k<ids.length;k++){const n=document.getElementById(ids[k]);if(n&&!n.readOnly&&!n.disabled){n.focus();break}}
}

/* ================= topshiriqlar bo'limi ================= */
function vTasks(){
  let l=S.tasks.filter(t=>(!ui.fEmp||t.emp===ui.fEmp)&&(!ui.fPer||t.per===ui.fPer)&&
    (!ui.fStat||(ui.fStat==='done'?t.done:ui.fStat==='late'?isLate(t):!t.done)));
  l.sort((a,b)=>a.done-b.done||(a.due||'9').localeCompare(b.due||'9'));
  const shown=l.slice(0,200);
  const rules=S.rules.map((r,i)=>`<div class="task ${i===0?'first':''}"><div class="body"><div class="t">${esc(r.title)}</div>
    <div class="meta"><span>${esc(empName(r.emp))}</span><span class="pill rep">${REP[r.rep]}</span><span class="num">${fmt(r.start)} dan</span></div></div>
    <div class="acts">${ui.delRule===r.id?`<button class="btn danger sm" data-act="rule2" data-id="${r.id}">Ha, to'xtatilsin</button><button class="btn sm" data-act="delno">Yo'q</button>`
      :`<button class="btn ghost sm" data-act="rule" data-id="${r.id}">To'xtatish</button>`}</div></div>`).join('');
  $('#app').innerHTML=`<div class="row" style="justify-content:space-between"><h1 style="margin:0;font-size:22px;letter-spacing:-.02em">Topshiriqlar</h1>${S.emps.length?`<button class="btn pri" data-act="addopen">${ui.addOpen?'Yopish':'+ Topshiriq'}</button>`:''}</div>`
  +addForm()+`
  <section class="card"><div class="row">
    <select id="f_emp" aria-label="Xodim" style="width:auto;flex:1 1 150px"><option value="">Hamma xodim</option>${S.emps.map(e=>`<option value="${e.id}" ${ui.fEmp===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select>
    <select id="f_per" aria-label="Turi" style="width:auto;flex:1 1 130px"><option value="">Hamma turi</option>${Object.entries(PER).map(([k,v])=>`<option value="${k}" ${ui.fPer===k?'selected':''}>${v}</option>`).join('')}</select>
    <select id="f_stat" aria-label="Holat" style="width:auto;flex:1 1 150px"><option value="">Hamma holat</option><option value="open" ${ui.fStat==='open'?'selected':''}>Bajarilmagan</option><option value="done" ${ui.fStat==='done'?'selected':''}>Bajarilgan</option><option value="late" ${ui.fStat==='late'?'selected':''}>Kechikkan</option></select>
  </div><div class="mute small num" style="margin-top:8px">${l.length} ta${l.length>200?' (200 tasi ko\'rsatilgan)':''}</div></section>
  <section class="card">${shown.length?shown.map((t,i)=>taskRow(t,true,i===0)).join(''):'<div class="empty"><b>Topshiriq topilmadi</b>Filtrlarni o\'zgartiring.</div>'}</section>
  ${rules?`<section class="card"><h2>Takrorlanuvchi ishlar</h2>${rules}</section>`:''}`+sampleOffer();
  bindForm();
  [['f_emp','fEmp'],['f_per','fPer'],['f_stat','fStat']].forEach(([id,k])=>$('#'+id).onchange=e=>{ui[k]=e.target.value;render()});
}

/* ================= xodimlar (akkauntlar bilan) ================= */
const staffOf=empId=>STAFF.find(s=>s.empId===empId);
function vEmps(){
  const rows=S.emps.map((e,i)=>{
    const n=S.tasks.filter(t=>t.emp===e.id),open=n.filter(t=>!t.done).length,mk=S.metrics.filter(m=>m.emp===e.id).length,acc=staffOf(e.id);
    const a=ui.acct&&ui.acct.emp===e.id?ui.acct:null;
    let accHtml;
    if(a){
      accHtml=`<div class="formgrid" style="margin-top:10px">
        ${a.mode==='new'?`<div class="field"><label class="lbl" for="ac_login">Login</label><input id="ac_login" autocomplete="off" autocapitalize="none" placeholder="masalan: ali"></div>`:''}
        <div class="field"><label class="lbl" for="ac_pw">${a.mode==='new'?'Parol':'Yangi parol'} (kamida 6 belgi)</label><input id="ac_pw" type="text" autocomplete="off" placeholder="parol"></div>
        <div class="full row"><button class="btn pri sm" data-act="accsave" data-id="${e.id}">${a.mode==='new'?'Akkaunt ochish':'Parolni almashtirish'}</button><button class="btn sm" data-act="acccancel">Bekor</button></div></div>`;
    }else if(acc){
      accHtml=`<div class="acc"><span class="login">${esc(acc.username)}</span>
        <button class="btn ghost sm" data-act="accpass" data-id="${e.id}">Parolni almashtirish</button>
        ${ui.delAcc===e.id?`<button class="btn danger sm" data-act="accdel2" data-id="${e.id}">Ha, akkaunt o'chirilsin</button><button class="btn sm" data-act="delno">Yo'q</button>`
          :`<button class="btn ghost sm" data-act="accdel" data-id="${e.id}">Akkauntni o'chirish</button>`}</div>`;
    }else accHtml=`<div class="acc"><span class="none">Akkaunt yo'q, o'zi kira olmaydi</span><button class="btn sm" data-act="accnew" data-id="${e.id}">Akkaunt ochish</button></div>`;
    return `<div class="person"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="pn">${esc(e.name)}</div>
        <div class="meta"><span class="num">${mk} ta reja</span><span class="num">${n.length} ta topshiriq, ${open} tasi ochiq</span></div></div>
        ${ui.delEmp===e.id?`<div class="acts"><button class="btn danger sm" data-act="emp2" data-id="${e.id}">Ha, hamma ma'lumoti bilan o'chirilsin</button><button class="btn sm" data-act="delno">Yo'q</button></div>`
          :`<button class="btn ghost sm" data-act="emp" data-id="${e.id}">O'chirish</button>`}</div>${accHtml}</div>`;
  }).join('');
  $('#app').innerHTML=`<section class="card"><h2>Yangi xodim</h2><div class="formgrid">
      <div class="field full"><label class="lbl" for="e_name">Ismi</label><input id="e_name" placeholder="Ism familiya" maxlength="80"></div>
      <div class="field"><label class="lbl" for="e_login">Kirish uchun login (ixtiyoriy)</label><input id="e_login" autocomplete="off" autocapitalize="none" placeholder="masalan: ali"></div>
      <div class="field"><label class="lbl" for="e_pw">Parol (ixtiyoriy)</label><input id="e_pw" type="text" autocomplete="off" placeholder="kamida 6 belgi"></div>
      <p class="hint full" style="margin:0">Login va parol bersangiz, xodim o'zi kirib faqat o'z hisobotini kiritadi. Parolni xodim keyin o'zgartira oladi.</p>
      <div class="full"><button class="btn pri" data-act="addemp">Qo'shish</button></div></div></section>
  <section class="card">${S.emps.length?rows:'<div class="empty"><b>Xodimlar yo\'q</b>Yuqoridan birinchi xodimni qo\'shing.</div>'}</section>`+sampleOffer();
  $('#e_name').onkeydown=e=>{if(e.key==='Enter')addEmp()};
}
async function addEmp(){
  const n=$('#e_name').value.trim(),login=$('#e_login').value.trim(),pw=$('#e_pw').value;
  if(!n){toast('Xodim ismini yozing');$('#e_name').focus();return}
  if((login||pw)&&!(login&&pw)){toast('Akkaunt uchun login va parolni ikkalasini yozing');return}
  if(login&&!/^[A-Za-z0-9_.@-]{3,40}$/.test(login)){toast('Login 3-40 belgi: lotin harflari, raqam, nuqta, pastki chiziq');return}
  if(login&&pw.length<6){toast('Parol kamida 6 belgi bo\'lsin');return}
  const emp={id:uid(),name:n};
  S.emps.push(emp);mark(pMeta());
  let msg='Xodim qo\'shildi';
  if(login){
    try{await flushNow();await apiJson('POST','/api/staff',{empId:emp.id,username:login,password:pw});msg='Xodim va akkaunt qo\'shildi'}
    catch(e){msg='Xodim qo\'shildi, lekin akkaunt ochilmadi: '+e.message}
    await loadStaffList();
  }
  render();toast(msg);
}
async function saveAccount(empId){
  const a=ui.acct;if(!a)return;
  const pw=$('#ac_pw').value;
  if(pw.length<6){toast('Parol kamida 6 belgi bo\'lsin');return}
  try{
    if(a.mode==='new'){
      const login=$('#ac_login').value.trim();
      if(!/^[A-Za-z0-9_.@-]{3,40}$/.test(login)){toast('Login 3-40 belgi: lotin harflari, raqam, nuqta, pastki chiziq');return}
      await flushNow();
      await apiJson('POST','/api/staff',{empId,username:login,password:pw});toast('Akkaunt ochildi');
    }else{await apiJson('PUT','/api/staff/'+encodeURIComponent(empId)+'/password',{password:pw});toast('Parol almashtirildi')}
    ui.acct=null;await loadStaffList();render();
  }catch(e){toast(e.message)}
}

/* ================= hisobot ================= */
function vReport(){
  const t0=today();
  if(ui.rt>t0)ui.rt=t0;if(ui.rf>ui.rt)ui.rf=ui.rt;
  const rep=buildReport(S,ui.rf,ui.rt,t0);
  const sections=rep.emps.map(x=>{
    const ms=x.ms.map(k=>{const pc=k.pct==null?'':(k.pct>=100?'gd':k.pct>=80?'wn':'lt');
      const lb=labelsOf(k.m),lim=k.limit,pcc=k.pct==null?'':(lim?(k.pct<=100?'gd':k.pct<=120?'wn':'lt'):pc);
      return `<h3>${esc(k.m.name)}${k.m.unit?', '+esc(k.m.unit):''} · ${planWord(k.m)} ${fmtN(targetOn(k.m,ui.rt))}</h3>
      <div class="mstrip"><div><span class="lbl">${lb.base}</span><b class="num">${fmtN(k.sumBase)}</b></div><div><span class="lbl">${lb.done}</span><b class="num">${fmtN(k.sumDone)}</b></div>
        <div><span class="lbl">${lb.pct}</span><b class="num ${pcc}">${k.pct==null?'—':k.pct+'%'}</b></div>
        <div><span class="lbl">${lb.gap}</span><b class="num ${k.gap<0?'lt':k.gap>0?'gd':''}">${sgn(k.gap)}</b></div>
        <div><span class="lbl">${lb.carry}</span><b class="num ${k.debt>0?'lt':''}">${k.debt>0?fmtN(k.debt):'—'}</b></div></div>
      <div class="tablewrap"><table class="num"><thead><tr><th>${entryOf(k.m)==='week'?'Hafta':entryOf(k.m)==='month'?'Oy':'Sana'}</th><th class="r hm">${lim?'Limit':'Me\'yor'}</th><th class="r hm">${lim?'Oshgan':'O\'tgan qarz'}</th><th class="r">${lim?'Ruxsat':'Reja'}</th><th class="r">${lim?'Ishlatildi':'Fakt'}</th><th class="r">Farq</th><th>Holat</th></tr></thead><tbody>
      ${k.rows.map(r=>{const st=rowState(r),cls=r.actual==null?(r.missing?'wn':''):(r.diff>=0?'gd':'lt');
        return `<tr><td>${rowLabel(k.m,r)}</td><td class="r hm">${fmtN(r.base)}</td><td class="r hm">${r.carryIn?fmtN(r.carryIn):'—'}</td><td class="r">${fmtN(r.plan)}</td><td class="r"><b>${r.actual==null?'—':fmtN(r.actual)}</b></td><td class="r ${cls}">${r.actual==null?'—':sgn(r.diff)}</td><td class="${cls}">${esc(st.t)}${r.actual!=null&&r.diff<0?(lim?' ('+nextWord(k.m)+' limitdan −'+fmtN(-r.diff)+')':' ('+nextWord(k.m)+' +'+fmtN(-r.diff)+')'):''}</td></tr>`}).join('')}
      <tr class="tot"><td>Jami</td><td class="r hm">${fmtN(k.sumBase)}</td><td class="hm"></td><td></td><td class="r">${fmtN(k.sumDone)}</td><td class="r ${k.gap<0?'lt':k.gap>0?'gd':''}">${sgn(k.gap)}</td><td>${k.pct==null?'—':k.pct+(lim?'% sarflandi':'% bajarildi')}</td></tr></tbody></table></div>
      ${k.missing?`<p class="small wn" style="margin:8px 0 0">Kiritilmagan ${isPeriodic(k.m)?'davrlar':'kunlar'}: ${k.missing} ta (0 deb hisoblangan)</p>`:''}`}).join('');
    const ts=x.ts.length?`<h3>Topshiriqlar: ${x.tdone} / ${x.ts.length} (${x.tpct}%)</h3><div class="tablewrap"><table><thead><tr><th>Muddat</th><th>Topshiriq</th><th>Holat</th><th>Izoh</th></tr></thead><tbody>
      ${x.ts.map(t=>`<tr><td class="num">${fmtDW(t.due)}</td><td>${esc(t.title)}</td><td class="${t.done?'gd':(t.due<t0?'lt':'')}">${esc(taskStatus(t,t0))}</td><td>${esc(t.note||'')}</td></tr>`).join('')}</tbody></table></div>`:'';
    return `<section class="card"><h2>${esc(x.e.name)}</h2>${ms}${ts}</section>`;
  }).join('');
  const overRows=rep.emps.flatMap(x=>x.ms.map(k=>{const pc=k.pct==null?'':(k.limit?(k.pct<=100?'gd':k.pct<=120?'wn':'lt'):(k.pct>=100?'gd':k.pct>=80?'wn':'lt'));
    return `<tr><td class="sp2 nl" data-label="Xodim"><b>${esc(x.e.name)}</b></td><td class="nl" data-label="Reja">${esc(k.m.name)}${k.m.unit?' ('+esc(k.m.unit)+')':''} <span class="pill">${KIND_NAME[kindOf(k.m)]}${k.limit?' · limit':''}</span></td><td class="r hm" data-label="Me'yor">${fmtN(k.sumBase)}</td><td class="r hm" data-label="Fakt">${fmtN(k.sumDone)}</td><td class="r nl ar ${pc}" data-label="Bajarilish"><b>${k.pct==null?'—':k.pct+'%'}</b></td><td class="r ${k.gap<0?'lt':k.gap>0?'gd':''}" data-label="Rejadan farq"><b>${sgn(k.gap)}</b></td><td class="r ${k.debt>0?'lt':''}" data-label="Keyingiga qo'shiladi">${k.debt>0?fmtN(k.debt):'—'}</td></tr>`})).join('');
  const overview=overRows?`<section class="card"><h2>Umumiy natija</h2><div class="tablewrap"><table class="num rt"><thead><tr><th>Xodim</th><th>Reja</th><th class="r hm">Reja/limit</th><th class="r hm">Fakt</th><th class="r">Bajarilish</th><th class="r">Farq</th><th class="r">Keyingiga</th></tr></thead><tbody>${overRows}</tbody></table></div></section>`:'';
  $('#app').innerHTML=`<section class="card"><h2>Hisobot</h2><div class="row">
      <div class="field" style="flex:1 1 150px"><label class="lbl" for="r_from">Qachondan</label><input type="date" id="r_from" value="${ui.rf}" max="${t0}"></div>
      <div class="field" style="flex:1 1 150px"><label class="lbl" for="r_to">Qachongacha</label><input type="date" id="r_to" value="${ui.rt}" max="${t0}"></div></div>
      <div class="row" style="margin-top:12px"><button class="btn sm" data-act="rpreset" data-v="week">Oxirgi 7 kun</button>
      <button class="btn sm" data-act="rpreset" data-v="month">Shu oy</button>
      <button class="btn sm" data-act="rpreset" data-v="prev">O'tgan oy</button>
      <button class="btn pri" data-act="docx" style="margin-left:auto" ${rep.emps.length?'':'disabled'}>Word faylga yuklab olish</button></div></section>`
    +overview+(sections||'<section class="card empty"><b>Bu davrda ma\'lumot yo\'q</b>Davrni o\'zgartiring.</section>');
}

/* ================= paneller: faollik, zaxira, parol ================= */
function closeBtn(){return '<button class="btn ghost sm" data-act="panel" data-v="">Yopish</button>'}
function logPanel(){
  const rows=ui.logRows;
  let body;
  if(rows===null)body='<p class="mute">Yuklanmoqda…</p>';
  else if(!rows.length)body='<p class="mute">Hozircha hech narsa yo\'q. Xodimlar kiritgan sonlar va akkaunt o\'zgarishlari shu yerda ko\'rinadi.</p>';
  else{
    let day='';
    body=rows.map(r=>{
      const d=new Date(r.ts),ds=dstr(d),tm=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      const h=ds!==day?(day=ds,`<div class="logday">${esc(dayTitle(ds))}</div>`):'';
      return h+`<div class="logrow"><span class="tm num">${tm}</span><span><span class="who">${esc(r.who)}</span> · ${esc(r.text)}</span></div>`;
    }).join('');
  }
  return `<section class="card"><div class="group-h"><h2>Faollik tarixi</h2>${closeBtn()}</div>${body}</section>`;
}
async function loadLog(){
  try{ui.logRows=await apiJson('GET','/api/log?limit=200')}catch(e){ui.logRows=[]}
  if(ui.panel==='log'){const old=$('#panelslot');if(old)old.innerHTML=logPanel()}
}
function accountPanel(){
  return `<section class="card"><div class="group-h"><h2>Parolni o'zgartirish</h2>${closeBtn()}</div>
    <p class="mute" style="margin:0 0 12px">Kirgan akkaunt: <b style="color:var(--ink)">${esc(ME.username)}</b></p>
    <div class="formgrid">
      <div class="field full"><label class="lbl" for="pw_old">Hozirgi parol</label><input type="password" id="pw_old" autocomplete="current-password"></div>
      <div class="field"><label class="lbl" for="pw_new">Yangi parol (kamida ${isAdmin()?8:6} belgi)</label><input type="password" id="pw_new" autocomplete="new-password"></div>
      <div class="field"><label class="lbl" for="pw_new2">Yangi parolni takrorlang</label><input type="password" id="pw_new2" autocomplete="new-password"></div>
      <div class="full"><button class="btn pri" data-act="chpass">Parolni o'zgartirish</button></div>
    </div></section>`;
}
function backupPanel(){
  return `<section class="card"><div class="group-h"><h2>Zaxira nusxa</h2>${closeBtn()}</div>
    <p class="mute" style="margin:0 0 12px">Ma'lumotlar serverda saqlanadi va server har kuni o'zi nusxa oladi. Baribir vaqti-vaqti bilan fayl yuklab olib turing.</p>
    <div class="row" style="margin-bottom:10px"><button class="btn pri" data-act="bkfile">Fayl sifatida saqlash</button><button class="btn" data-act="copy">Matnni nusxalash</button></div>
    <textarea class="big" id="bk_out" readonly aria-label="Zaxira matni">${esc(JSON.stringify(S))}</textarea>
    <div class="lbl" style="margin:18px 0 6px">Zaxiradan tiklash</div>
    <textarea class="big" id="bk_in" placeholder="Zaxira matnini shu yerga joylang yoki fayl tanlang" aria-label="Tiklash uchun matn">${esc(ui.impText)}</textarea>
    <div class="row" style="margin-top:10px">
      ${ui.impConfirm?`<button class="btn danger" data-act="imp2">Hozirgi ma'lumot o'chib, almashtiriladi. Tasdiqlayman</button><button class="btn" data-act="delno">Bekor</button>`
        :`<button class="btn" data-act="imp">Tiklash</button>`}
      <input type="file" id="bk_file" accept=".json,.txt" aria-label="Fayldan tiklash" style="height:auto;border:0;background:none;padding:0;width:auto"></div></section>`;
}

/* ================= umumiy chizish ================= */
function render(){
  if(!ready)return;
  renderTabs();renderMenu();
  const tab=isAdmin()?ui.tab:'today';
  $('#app').className=tab==='report'?'wide':'';
  ({today:vToday,kpi:vKpi,tasks:vTasks,report:vReport,emps:vEmps})[tab]();
  if(ui.panel&&isAdmin()||ui.panel==='account'){
    const html=ui.panel==='log'?logPanel():ui.panel==='backup'?backupPanel():ui.panel==='account'?accountPanel():'';
    if(html){
      $('#app').insertAdjacentHTML('afterbegin',`<div id="panelslot">${html}</div>`);
      const f=$('#bk_file');if(f)f.onchange=e=>{const fl=e.target.files[0];if(!fl)return;const r=new FileReader();r.onload=()=>{$('#bk_in').value=r.result};r.readAsText(fl)};
    }
  }
}

/* ================= fayllar ================= */
async function saveFile(name,data){
  const url=URL.createObjectURL(new Blob([data]));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
async function exportDocx(){
  if(typeof JSZip==='undefined'){toast('Word modulini yuklab bo\'lmadi. Sahifani yangilang');return}
  const rep=buildReport(S,ui.rf,ui.rt,today());
  if(!rep.emps.length){toast('Bu davrda ma\'lumot yo\'q');return}
  const zip=new JSZip(),files=docxFiles(rep);
  Object.entries(files).forEach(([p,c])=>zip.file(p,c));
  const buf=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  await saveFile('hisobot_'+ui.rf+'_'+ui.rt+'.docx',buf);
}

function loadSample(){
  const a=uid(),b=uid(),c=uid(),t=today();
  S.emps.push({id:a,name:'Namuna: Dilshod A.'},{id:b,name:'Namuna: Madina K.'},{id:c,name:'Namuna: Jasur R.'});
  const add=(emp,title,per,due,done)=>S.tasks.push({id:uid(),emp,title,per,due,done:!!done,doneAt:done?due:'',note:'',rule:undefined});
  add(a,'Kassa hisobotini topshirish','day',t);add(a,'Mijozlar bazasini yangilash','week',addDays(t,2));add(a,'Oylik savdo tahlili','month',addDays(t,-1));
  add(b,'Ombor qoldig\'ini sanash','day',t,true);add(b,'Yangi mahsulot narxlarini kiritish','day',t);
  add(c,'Yetkazib berish jadvalini tekshirish','day',t);add(c,'Shartnomalarni tartiblash','week',addDays(t,-3));
  const start=addDays(t,-6),days=[1,2,3,4,5,6,0];
  const m1={id:uid(),emp:a,name:'Pul tushumi',unit:'mln',targets:[{from:start,v:7}],days,start,end:'',open:0};
  const m2={id:uid(),emp:a,name:'Visit',unit:'ta',targets:[{from:start,v:5}],days,start,end:'',open:0};
  const m3={id:uid(),emp:b,name:'Yangi to\'lovchi',unit:'ta',targets:[{from:start,v:3}],days,start,end:'',open:0};
  const w1={id:uid(),emp:b,name:'Yangi mijoz',unit:'ta',kind:'week',targets:[{from:addDays(t,-21),v:12}],days:[0,1,2,3,4,5,6],start:addDays(t,-21),end:'',open:0};
  const o1={id:uid(),emp:c,name:'Savdo hajmi',unit:'mln',kind:'month',targets:[{from:addDays(t,-70),v:150}],days:[0,1,2,3,4,5,6],start:addDays(t,-70),end:'',open:0};
  const lead={id:uid(),emp:a,name:'Leadlar (limit)',unit:'ta',mode:'limit',basis:'day',entry:'day',targets:[{from:start,v:10}],days,start,end:'',open:0};
  S.vals[lead.id]={};[8,12,9,10,7,13].forEach((v,i)=>S.vals[lead.id][addDays(start,i)]=v);
  S.metrics.push(m1,m2,m3,w1,o1,lead);
  S.vals[w1.id]={};[10,14,9].forEach((v,i)=>S.vals[w1.id][periodRange(w1,addDays(t,-21+7*i)).from]=v);
  S.vals[o1.id]={};[[-70,140],[-40,165]].forEach(([o,v])=>S.vals[o1.id][periodRange(o1,addDays(t,o)).from]=v);
  const f1=[6,8,7,5,9,6],f2=[3,7,5,5,4,6],f3=[2,4,3,3,1,3];
  [[m1,f1],[m2,f2],[m3,f3]].forEach(([m,f])=>{S.vals[m.id]={};f.forEach((v,i)=>S.vals[m.id][addDays(start,i)]=v)});
  markAll();render();toast('Namuna yuklandi');
}

/* ================= amallar ================= */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el||el.type==='checkbox')return;
  const a=el.dataset.act,id=el.dataset.id,v=el.dataset.v;
  const reset=()=>{ui.del=ui.delEmp=ui.delRule=ui.delMetric=ui.delAcc=null;ui.impConfirm=false};
  switch(a){
    case'menu':ui.menu=!ui.menu;renderMenu();break;
    case'theme':cycleTheme();break;
    case'panel':ui.menu=false;ui.panel=v;ui.impConfirm=false;
      if(v==='log'){ui.logRows=null;loadLog()}
      render();if(v)window.scrollTo(0,0);break;
    case'sub':ui.sub=v;ui.showBehind=false;render();break;
    case'behind':ui.showBehind=!ui.showBehind;render();break;
    case'tab':ui.tab=v;reset();ui.edit=null;ui.editM=null;ui.panel='';ui.acct=null;
      if(v==='emps')await loadStaffList();
      render();window.scrollTo(0,0);break;
    case'pickdate':{const p=$('#dpick');if(p){try{p.showPicker()}catch(x){p.focus();p.click()}}break}
    case'gotoday':ui.date=today();render();break;
    case'dayshift':ui.date=addDays(ui.date,Number(v));render();break;
    case'addopen':ui.addOpen=!ui.addOpen;render();if(ui.addOpen){const t=$('#a_title');if(t)t.focus()}break;
    case'add':addTask();break;
    case'addemp':addEmp();break;
    case'accnew':reset();ui.acct={emp:id,mode:'new'};render();{const t=$('#ac_login');if(t)t.focus()}break;
    case'accpass':reset();ui.acct={emp:id,mode:'pass'};render();{const t=$('#ac_pw');if(t)t.focus()}break;
    case'acccancel':ui.acct=null;render();break;
    case'accsave':saveAccount(id);break;
    case'accdel':reset();ui.delAcc=id;render();break;
    case'accdel2':
      try{await apiJson('DELETE','/api/staff/'+encodeURIComponent(id));toast('Akkaunt o\'chirildi')}catch(x){toast(x.message)}
      ui.delAcc=null;await loadStaffList();render();break;
    case'rpreset':{const t=today();
      if(v==='week'){ui.rf=addDays(t,-6);ui.rt=t}
      else if(v==='month'){ui.rf=t.slice(0,8)+'01';ui.rt=t}
      else{const d=pd(t.slice(0,8)+'01');d.setDate(0);ui.rt=dstr(d);ui.rf=ui.rt.slice(0,8)+'01'}
      render();break}
    case'docx':exportDocx();break;
    case'kconfirm':confirmK(el);break;
    case'sample':loadSample();break;
    case'addmetric':addMetric();break;
    case'metricopen':ui.metricOpen=!ui.metricOpen;render();if(ui.metricOpen){const t=$('#m_name');if(t)t.focus()}break;
    case'editm':reset();ui.editM=id;render();break;
    case'cancelm':ui.editM=null;render();break;
    case'savemetric':saveMetric(id);break;
    case'stopm':{const m=S.metrics.find(x=>x.id===id);if(m){m.end=today();mark(pMeta());render()}break}
    case'resumem':{const m=S.metrics.find(x=>x.id===id);if(m){m.end='';mark(pMeta());render()}break}
    case'delm':reset();ui.delMetric=id;render();break;
    case'delm2':{
      const paths=Object.keys(S.vals[id]||{}).map(d=>pVal(id,d));
      S.metrics=S.metrics.filter(x=>x.id!==id);delete S.vals[id];ui.delMetric=null;
      mark(pMeta(),...paths);render();toast('O\'chirildi');break}
    case'edit':reset();ui.edit=id;render();break;
    case'canceledit':ui.edit=null;render();break;
    case'saveedit':{const t=S.tasks.find(x=>x.id===id);const title=$('#e_title').value.trim();
      if(t&&title){const old=pTask(t);t.title=title;t.note=$('#e_note').value.trim();t.due=$('#e_due').value||t.due;if(t.done&&!t.doneAt)t.doneAt=today();mark(old,pTask(t))}
      ui.edit=null;render();break}
    case'del':reset();ui.del=id;render();break;
    case'del2':{const t=S.tasks.find(x=>x.id===id);
      if(t){let extra=[];
        if(t.rule){const r=S.rules.find(x=>x.id===t.rule);if(r){(r.skip=r.skip||[]).push(t.due);extra=[pMeta()]}}
        S.tasks=S.tasks.filter(x=>x.id!==id);mark(pTask(t),...extra)}
      ui.del=null;render();toast('O\'chirildi');break}
    case'delno':reset();render();break;
    case'rule':reset();ui.delRule=id;render();break;
    case'rule2':S.rules=S.rules.filter(x=>x.id!==id);ui.delRule=null;mark(pMeta());render();toast('Takrorlanish to\'xtatildi');break;
    case'emp':reset();ui.delEmp=id;render();break;
    case'emp2':{
      const paths=S.tasks.filter(t=>t.emp===id).map(pTask);
      S.metrics.filter(m=>m.emp===id).forEach(m=>{Object.keys(S.vals[m.id]||{}).forEach(d=>paths.push(pVal(m.id,d)));delete S.vals[m.id]});
      S.emps=S.emps.filter(x=>x.id!==id);S.tasks=S.tasks.filter(t=>t.emp!==id);S.rules=S.rules.filter(x=>x.emp!==id);S.metrics=S.metrics.filter(m=>m.emp!==id);
      ui.delEmp=null;mark(pMeta(),...paths);
      if(staffOf(id)){try{await flushNow();await apiJson('DELETE','/api/staff/'+encodeURIComponent(id))}catch(x){}await loadStaffList()}
      render();toast('Xodim o\'chirildi');break}
    case'chpass':{
      const o=$('#pw_old').value,n=$('#pw_new').value,n2=$('#pw_new2').value,min=isAdmin()?8:6;
      if(n.length<min){toast('Yangi parol kamida '+min+' belgi bo\'lsin');break}
      if(n!==n2){toast('Yangi parollar bir xil emas');break}
      apiJson('POST','/api/password',{old:o,next:n}).then(()=>{ui.panel='';render();toast('Parol o\'zgartirildi')}).catch(x=>toast(x.message));break}
    case'logout':apiJson('POST','/api/logout').finally(()=>location.replace('/login'));break;
    case'bkfile':saveFile('nazorat-zaxira-'+today()+'.json',JSON.stringify(S,null,1));break;
    case'copy':{const ta=$('#bk_out');
      const fb=()=>{ta.select();toast('Matn belgilandi, Ctrl+C bosing')};
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(ta.value).then(()=>toast('Nusxalandi'),fb);else fb();break}
    case'imp':{const txt=$('#bk_in').value.trim();
      try{const j=JSON.parse(txt);if(!j.emps||!j.tasks)throw 0;ui.impConfirm=true;ui.impText=txt;render()}
      catch(x){toast('Matn noto\'g\'ri. To\'liq zaxira matnini joylang')}break}
    case'imp2':{try{const j=JSON.parse(ui.impText);S=norm(j);ui.impConfirm=false;ui.impText='';ui.panel='';markAll();render();toast('Tiklandi')}catch(x){toast('Xatolik')}break}
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&ui.menu){ui.menu=false;renderMenu()}
  if(e.key==='Enter'&&e.target.classList&&e.target.classList.contains('kin')&&!e.target.readOnly){e.preventDefault();const b=e.target.closest('[data-krow]').querySelector('[data-act="kconfirm"]');if(b)confirmK(b)}
  if(e.key==='Enter'&&e.target.id==='m_target')addMetric();
  if(e.key==='Enter'&&(e.target.id==='ac_pw'||e.target.id==='ac_login')){const b=document.querySelector('[data-act="accsave"]');if(b)saveAccount(b.dataset.id)}
});
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.id==='m_target'||el.id==='m_unit'){updDerived();return}
  if(!el.classList||!el.classList.contains('kin')||el.readOnly)return;
  const p=parseNum(el.value);
  refreshKpi(el.dataset.mid,el.dataset.date,p.v);
});
let dateTimer=null;
document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.dataset&&el.dataset.act==='done'){
    const t=S.tasks.find(x=>x.id===el.dataset.id);if(!t)return;
    const done=el.checked;
    if(isAdmin()){t.done=done;t.doneAt=done?today():'';mark(pTask(t));render();return}
    try{await apiJson('POST','/api/staff-task',{id:t.id,done});t.done=done;t.doneAt=done?today():''}
    catch(x){toast(x.message)}
    render();return;
  }
  if(el.name==='m_mode'||el.name==='m_basis'||el.classList&&el.classList.contains('mday')){
    const mode=(document.querySelector('input[name=m_mode]:checked')||{}).value,basis=(document.querySelector('input[name=m_basis]:checked')||{}).value;
    const lim=mode==='limit',w=basis==='month'?'oyiga':basis==='week'?'haftasiga':'kuniga';
    $('#m_tl').textContent=(lim?'Limit: ':'Reja: ')+w+' qancha?';
    $('#m_target').placeholder=basis==='month'?'32':basis==='week'?'8':'7';
    $('#m_ol').textContent=lim?'Kechadan oshgani (bo\'lsa)':'Hozirgi qarz (bo\'lsa)';
    $('#m_ohint').textContent=lim?'Oldingi kunda limitdan oshgan miqdor. Masalan 2 yozsangiz va limit 10 bo\'lsa, birinchi kunning limiti 8 bo\'ladi.'
      :'Shu kungacha yig\'ilgan, yopilmagan miqdor. Masalan 12 yozsangiz va kunlik reja 7 bo\'lsa, birinchi kunning rejasi 19 bo\'ladi.';
    const ent=document.querySelector('input[name=m_entry][value='+basis+']');   // kiritish darajasi odatda reja darajasi bilan bir xil
    if(ent&&el.name==='m_basis')ent.checked=true;
    updDerived();
    return;
  }
  // sana maydonlari: faqat to'liq va to'g'ri sana tanlanganda, biroz kutib qo'llanadi (qo'lda yozilganda oraliq qiymatlar e'tiborga olinmaydi)
  if(el.id==='dpick'||el.id==='r_from'||el.id==='r_to'){
    const val=el.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(val)||val.slice(0,4)<'2000')return;
    clearTimeout(dateTimer);
    dateTimer=setTimeout(()=>{
      if(el.id==='dpick')ui.date=val;else if(el.id==='r_from')ui.rf=val;else ui.rt=val;
      render();
    },el.id==='dpick'?0:700);
  }
});

/* ================= boshlash ================= */
async function boot(){
  setStatus('load');
  try{
    const me=await api('GET','/api/me');
    ME=await me.json();
    if(ME.role==='admin'){S=await loadAdminState();await loadStaffList()}
    else S=await loadStaffState();
    lastSig=JSON.stringify(S);
    ui.stamp=today();
    if(ME.role==='staff')document.title='Xodimlar nazorati';
    ready=true;setStatus('cloud');render();
  }catch(e){
    if(String(e&&e.message)==='unauthorized')return;
    setStatus('off');
    $('#app').innerHTML='<section class="card empty"><b>Serverga ulanib bo\'lmadi</b>Internetni tekshirib, qayta urinib ko\'ring.<div class="row"><button class="btn pri" id="retry">Qayta urinish</button></div></section>';
    $('#retry').onclick=()=>location.reload();
  }
}
boot();
