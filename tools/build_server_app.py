"""nazorat.html (bitta fayl, namuna/manba) dan server uchun server/public/app.html ni yasaydi.

Ishlatish:  python tools/build_server_app.py
nazorat.html ni tahrirlang, keyin shu skriptni ishga tushiring.
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(HERE, '..', 'nazorat.html')
dst = os.path.join(HERE, '..', 'server', 'public', 'app.html')
s = open(src, encoding='utf-8').read()

def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)

def cut(start, end, new):
    """start..end oralig'ini (end kirmaydi) new bilan almashtiradi"""
    global s
    i = s.index(start)
    j = s.index(end, i)
    s = s[:i] + new + s[j:]

# --- sahifa o'rami ---
s = (
    '<!doctype html>\n<html lang="uz">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    + s
)
rep('<header class="top">', '</head>\n<body>\n<header class="top">')
rep('</style>\n', '[hidden]{display:none!important}\n</style>\n')
s = s.rstrip() + '\n</body>\n</html>\n'
rep('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', '/vendor/jszip.min.js')

# --- brauzer xotirasi endi ishlatilmaydi (umumiy kompyuterda ma'lumot qolmasin) ---
cut("function readLocal()", "let S=emptyS();", "")
rep("let S=emptyS();", "let S=emptyS();\nlet ME='';")
cut("function mark(...paths){", "function markAll()", r"""function mark(...paths){
  paths.forEach(p=>dirty.add(p));
  clearTimeout(timer);timer=setTimeout(flush,500);setStatus('saving');
}
""")
cut("window.addEventListener('beforeunload'", "\nasync function initCloud()", r"""window.addEventListener('beforeunload',e=>{if(dirty.size||flushing){e.preventDefault();e.returnValue=''}});
""")
rep("async function flush(){\n  if(flushing||!cloud)return;", "async function flush(){\n  if(flushing)return;")

# --- server bilan ishlash ---
cut("async function initCloud(){", "/* takrorlanuvchi ishlar */", r"""function serverDB(){
  const call=async(method,url,body)=>{
    const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'nazorat'},body:body===undefined?undefined:JSON.stringify(body)});
    if(r.status===401){location.replace('/login');throw new Error('unauthorized')}
    return r;
  };
  const snap=(exists,data)=>({exists,data:()=>data});
  return{
    doc:path=>{const[col,id]=path.split('/');const u='/api/doc/'+col+'/'+encodeURIComponent(id);return{
      get:async()=>{const r=await call('GET',u);if(r.status===404)return snap(false);if(!r.ok)throw new Error('http '+r.status);return snap(true,await r.json())},
      set:async b=>{const r=await call('PUT',u,b);if(!r.ok)throw new Error('http '+r.status)},
      delete:async()=>{const r=await call('DELETE',u);if(!r.ok)throw new Error('http '+r.status)}}},
    collection:col=>({limit:()=>({get:async()=>{
      const r=await call('GET','/api/col/'+col);if(!r.ok)throw new Error('http '+r.status);
      const rows=await r.json();return{empty:!rows.length,docs:rows.map(x=>({id:x.id,data:()=>x.body}))}}})})
  };
}
async function apiPost(url,body){
  const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'nazorat'},body:JSON.stringify(body||{})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||'Xatolik ('+r.status+')');
  return j;
}
async function initCloud(){
  setStatus('load');
  DB=serverDB();
  const me=await fetch('/api/me',{credentials:'same-origin'});
  if(me.status===401){location.replace('/login');throw new Error('unauthorized')}
  ME=(await me.json()).username;
  const[meta,tc,vc]=await Promise.all([DB.doc(pMeta()).get(),DB.collection('tasks').limit(1000).get(),DB.collection('vals').limit(1000).get()]);
  const n=emptyS();
  if(meta.exists){const m=meta.data();n.emps=m.emps||[];n.rules=m.rules||[];n.metrics=m.metrics||[];known.add(pMeta())}
  tc.docs.forEach(d=>{(d.data().items||[]).forEach(t=>n.tasks.push(t));known.add('tasks/'+d.id)});
  vc.docs.forEach(d=>{const k=d.id.lastIndexOf('_'),mid=d.id.slice(0,k);n.vals[mid]=Object.assign(n.vals[mid]||{},d.data().d||{});known.add('vals/'+d.id)});
  S=n;cloud=true;setStatus('cloud');
}

""")

cut("(async()=>{\n  await initCloud();", "</script>", r"""(async()=>{
  try{await initCloud();ready=true;render()}
  catch(e){
    if(String(e&&e.message)==='unauthorized')return;
    setStatus('off');
    $('#app').innerHTML='<section class="card empty"><b>Serverga ulanib bo\'lmadi</b>Internetni tekshirib, qayta urinib ko\'ring.<div class="row"><button class="btn pri" id="retry">Qayta urinish</button></div></section>';
    $('#retry').onclick=()=>location.reload();
  }
})();
""")

# --- hisob paneli: parolni o'zgartirish, chiqish ---
rep("backup:false,impConfirm", "backup:false,account:false,impConfirm")
rep("""<button class="tab" data-act="backup" ${ui.backup?'aria-current="page"':''}>Zaxira</button>`;""",
    """<button class="tab" data-act="backup" ${ui.backup?'aria-current="page"':''}>Zaxira</button>`
   +`<button class="tab" data-act="account" ${ui.account?'aria-current="page"':''}>Hisob</button>`;""")
rep("function backupPanel(){", r"""function accountPanel(){
  return `<section class="card"><div class="group-h"><h2>Hisob</h2><button class="btn ghost sm" data-act="account">Yopish</button></div>
    <p class="mute" style="margin:0 0 12px">Kirgan akkaunt: <b style="color:var(--ink)">${esc(ME)}</b></p>
    <div class="formgrid">
      <div class="field"><label class="lbl" for="pw_old">Hozirgi parol</label><input type="password" id="pw_old" autocomplete="current-password"></div>
      <div class="field"><label class="lbl" for="pw_new">Yangi parol (kamida 8 belgi)</label><input type="password" id="pw_new" autocomplete="new-password"></div>
      <div class="field"><label class="lbl" for="pw_new2">Yangi parolni takrorlang</label><input type="password" id="pw_new2" autocomplete="new-password"></div>
      <div class="full row"><button class="btn pri sm" data-act="chpass">Parolni o'zgartirish</button><button class="btn sm" data-act="logout" style="margin-left:auto">Chiqish</button></div>
    </div></section>`;
}
function backupPanel(){""")
rep("  if(ui.backup){\n    $('#app').insertAdjacentHTML('afterbegin',backupPanel());",
    "  if(ui.account)$('#app').insertAdjacentHTML('afterbegin',accountPanel());\n  if(ui.backup){\n    $('#app').insertAdjacentHTML('afterbegin',backupPanel());")
cut("""<p class="mute" style="margin:0 0 10px">${cloud?""", """</p>\n    <div class="row" style="margin-bottom:8px">""",
    """<p class="mute" style="margin:0 0 10px">Ma\\'lumotlar serverda saqlanadi va har kuni server o\\'zi zaxira nusxa oladi. Baribir vaqti-vaqti bilan zaxira fayl yuklab olib turing.""")
rep("ui.backup=false;render();window.scrollTo(0,0);break;", "ui.backup=false;ui.account=false;render();window.scrollTo(0,0);break;")
rep("case'backup':ui.backup=!ui.backup;ui.impConfirm=false;render();break;",
    r"""case'backup':ui.backup=!ui.backup;ui.account=false;ui.impConfirm=false;render();break;
    case'account':ui.account=!ui.account;ui.backup=false;render();break;
    case'chpass':{
      const o=$('#pw_old').value,n=$('#pw_new').value,n2=$('#pw_new2').value;
      if(n.length<8){toast('Yangi parol kamida 8 belgi bo\'lsin');break}
      if(n!==n2){toast('Yangi parollar bir xil emas');break}
      apiPost('/api/password',{old:o,next:n}).then(()=>{ui.account=false;render();toast('Parol o\'zgartirildi')}).catch(e=>toast(e.message));break}
    case'logout':apiPost('/api/logout').finally(()=>location.replace('/login'));break;""")

open(dst, 'w', encoding='utf-8').write(s)
print('ok', len(s))
