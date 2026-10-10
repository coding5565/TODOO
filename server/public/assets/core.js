/* Xodimlar nazorati: hisob-kitob, hisobot va Word (.docx) yig'ish. Brauzerda ham, Node.js testlarda ham ishlaydi. */
const PER={day:'Kunlik',week:'Haftalik',month:'Oylik'};
const REP={day:'har kuni',week:'har hafta',month:'har oy'};
const MON=['yan','fev','mar','apr','may','iyn','iyl','avg','sen','okt','noy','dek'];
const DOW=['Yak','Du','Se','Chor','Pay','Ju','Sha'];
const DOW_ORDER=[1,2,3,4,5,6,0];

function dstr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function pd(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function today(){return dstr(new Date())}
function addDays(s,n){const d=pd(s);d.setDate(d.getDate()+n);return dstr(d)}
function fmt(s){if(!s)return'';const d=pd(s);return d.getDate()+'-'+MON[d.getMonth()]+', '+DOW[d.getDay()]}
function fmtD(s){if(!s)return'';const[y,m,d]=s.split('-');return d+'.'+m+'.'+y}
function fmtDW(s){return fmtD(s)+' '+DOW[pd(s).getDay()]}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function r6(x){return Math.round(x*1e6)/1e6}
function fmtN(x){
  if(x==null||isNaN(x))return'—';
  const r=Math.round(x*100)/100;let[i,f]=Math.abs(r).toFixed(2).split('.');
  f=f.replace(/0+$/,'');i=i.replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  return(r<0?'−':'')+i+(f?','+f:'');
}
function fmtIn(x){return x==null?'':String(r6(x)).replace('.',',')}
function parseNum(s){
  s=String(s).trim().replace(/\s/g,'').replace(',','.');
  if(s==='')return{empty:true};
  const n=Number(s);
  return(isNaN(n)||n<0||!isFinite(n))?{bad:true}:{v:r6(n)};
}
function withUnit(m,v){return fmtN(v)+(m.unit?' '+m.unit:'')}

/* ---- ko'rsatkich hisobi ----
   Reja BIR MARTA (kuniga, haftasiga yoki oyiga) kiritiladi; qolgan ikkitasi ish kunlari bo'yicha o'zi hisoblanadi.
   Fakt qaysi darajada kiritilishi alohida tanlanadi (har kuni / hafta oxirida / oy oxirida).
   Turi:
     "reja"  (kamida shuncha): yetmagan qism keyingi davrga QO'SHILADI, ortiqchasi qolaveradi;
     "limit" (shundan oshmasin): oshgan qism keyingi davr limitidan AYRILADI, ishlatilmagan qismi qo'shilmaydi. */
function targetOn(m,d){let v=m.targets[0].v;for(const t of m.targets){if(t.from<=d)v=t.v}return v}
const entryOf=m=>m.entry||(m.kind==='week'||m.kind==='month'?m.kind:'day');   // fakt kiritiladigan daraja
const basisOf=m=>m.basis||entryOf(m);                                           // reja miqdori qaysi daraja uchun yozilgan
const isPeriodic=m=>entryOf(m)!=='day';
const kindOf=entryOf;
const isLimit=m=>m.mode==='limit';
const KIND_ORDER={day:0,week:1,month:2};
const LEVEL_RANK=KIND_ORDER;
/* kunlik kiritiladigan, lekin reja haftalik/oylik: yetmagan qism davrning QOLGAN kunlariga teng taqsimlanadi */
const isDynamic=m=>entryOf(m)==='day'&&basisOf(m)!=='day';
const KIND_NAME={day:'Kunlik',week:'Haftalik',month:'Oylik'};
const BASIS_NAME={day:'kunlik',week:'haftalik',month:'oylik'};
const NEXT_WORD={day:'ertaga',week:'keyingi haftaga',month:'keyingi oyga'};
const MONTHS_UZ=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
/* daraja bo'yicha davr chegaralari: kun, hafta (dushanbadan yakshanbagacha) yoki oy */
function rangeOf(level,d){
  if(level==='day')return{from:d,to:d};
  if(level==='week'){const dw=(pd(d).getDay()+6)%7,from=addDays(d,-dw);return{from,to:addDays(from,6)}}
  const[y,mo]=d.split('-').map(Number);
  return{from:dstr(new Date(y,mo-1,1)),to:dstr(new Date(y,mo,0))};
}
const periodRange=(m,d)=>rangeOf(entryOf(m),d);
const _wd=new Map();
function wdCount(days,from,to){
  const key=days.join('')+'|'+from+'|'+to;let v=_wd.get(key);
  if(v===undefined){v=0;for(let x=from;x<=to;x=addDays(x,1))if(days.includes(pd(x).getDay()))v++;_wd.set(key,v);if(_wd.size>800)_wd.clear()}
  return v;
}
/* bitta ish kunining ulushi */
function shareOf(m,d){
  const v=targetOn(m,d),b=basisOf(m);
  if(b==='day')return v;
  if(b==='week')return v/Math.max(1,m.days.length);
  const r=rangeOf('month',d);return v/Math.max(1,wdCount(m.days,r.from,r.to));
}
/* davr (kun/hafta/oy) uchun reja: shu davrdagi ish kunlari ulushlarining yig'indisi */
function planOf(m,level,d){
  const r=rangeOf(level,d);
  if(level!=='day'&&basisOf(m)===level)return targetOn(m,r.from);
  let s=0;for(let x=r.from;x<=r.to;x=addDays(x,1))if(m.days.includes(pd(x).getDay()))s+=shareOf(m,x);
  return r6(s);
}
function planWord(m){return BASIS_NAME[basisOf(m)]+(isLimit(m)?' limit':' reja')}
function nextWord(m){return NEXT_WORD[entryOf(m)]}
function planLabel(m,d){return (basisOf(m)==='week'?'haftasiga ':basisOf(m)==='month'?'oyiga ':'kuniga ')+withUnit(m,targetOn(m,d))+(isLimit(m)?' limit':'')}
/* kuniga / haftasiga / oyiga: bitta reja asosida hisoblangan uchala ko'rinish */
function derivedParts(m,d){
  const b=basisOf(m),u=m.unit?' '+m.unit:'';
  const f=(label,v,lv)=>label+' '+(b===lv?'':'≈ ')+fmtN(Math.round(v*100)/100)+u;
  return[f('kuniga',shareOf(m,d),'day'),f('haftasiga',planOf(m,'week',d),'week'),f('oyiga',planOf(m,'month',d),'month')];
}
function periodLabel(m,from){
  if(entryOf(m)==='week')return fmtD(from).slice(0,5)+' – '+fmtD(addDays(from,6));
  const[y,mo]=from.split('-').map(Number);return MONTHS_UZ[mo-1]+' '+y;
}
/* haftalik/oylik davr ichidagi faktlar yig'indisi (kiritilmagan bo'lsa undefined) */
function periodTotal(m,vals,d){
  const r=periodRange(m,d);let has=false,t=0;
  for(const k in (vals||{}))if(k>=r.from&&k<=r.to){has=true;t+=vals[k]}
  return has?r6(t):undefined;
}
function getVal(m,vals,key){return isPeriodic(m)?periodTotal(m,vals,key):(vals||{})[key]}
function rowLabel(m,r){return isPeriodic(m)?periodLabel(m,r.date):fmtDW(r.date)}
/* bitta qadam: reja uchun (plan=base+qarz) yoki limit uchun (ruxsat=base-oshgan) */
function step(m,base,carry,done){
  if(isLimit(m)){
    const eff=base-carry,allowed=Math.max(0,r6(eff));
    return{plan:allowed,carryOut:r6(Math.max(0,done-eff)),surplus:r6(Math.max(0,eff-done)),diff:r6(allowed-done)};
  }
  const plan=r6(base+carry);
  return{plan,carryOut:r6(Math.max(0,plan-done)),surplus:r6(Math.max(0,done-plan)),diff:r6(done-plan)};
}
const rowOf=(m,o,base,carry,done)=>Object.assign({base,carryIn:r6(carry),done,mode:isLimit(m)?'limit':'target'},step(m,base,carry,done),o);
/* haftalik/oylik: har davr uchun bitta qator */
function calcPeriods(m,vals,upto,t0){
  const rows=[];let carry=r6(Number(m.open)||0);vals=vals||{};
  const L=entryOf(m),last=m.end&&m.end<upto?m.end:upto,keys=Object.keys(vals);
  let from=periodRange(m,m.start).from;
  for(let g=0;from<=last&&g<1500;g++){
    const r=rangeOf(L,from),base=planOf(m,L,r.from);
    let done=0,has=false;for(const k of keys)if(k>=r.from&&k<=r.to){done+=vals[k];has=true}
    done=r6(done);
    const ended=r.to<t0,row=rowOf(m,{date:r.from,end:r.to,working:true,actual:has?done:null,missing:!has&&ended,pending:!has&&!ended},base,carry,done);
    rows.push(row);carry=row.carryOut;from=addDays(r.to,1);
  }
  return rows;
}
/* davr (hafta/oy) rejasi kunlik kiritiladi: kunlik reja = (davr rejasi - hozirgacha bajarilgani) / qolgan ish kunlari.
   Davr oxiridagi yetmagan qism (limitda oshgan qism) keyingi davrga o'tadi. */
function calcDynamic(m,vals,upto,t0){
  const rows=[],B=basisOf(m),lim=isLimit(m);vals=vals||{};
  let carry=r6(Number(m.open)||0);
  const last=m.end&&m.end<upto?m.end:upto,keys=Object.keys(vals);
  const sumIn=(a,b)=>{let t=0;for(const k of keys)if(k>=a&&k<=b)t+=vals[k];return t};
  let from=rangeOf(B,m.start).from;
  for(let g=0;from<=last&&g<1500;g++){
    const R=rangeOf(B,from),baseB=planOf(m,B,R.from),eff=lim?baseB-carry:baseB+carry;
    const startD=R.from<m.start?m.start:R.from,endD=R.to<last?R.to:last;
    let doneB=startD>R.from?sumIn(R.from,addDays(startD,-1)):0;
    for(let d=startD;d<=endD;d=addDays(d,1)){
      const working=m.days.includes(pd(d).getDay()),has=vals[d]!==undefined;
      if(!working&&!has)continue;
      const remDays=working?wdCount(m.days,d,R.to):0,remain=r6(eff-doneB);
      const plan=working?r6(Math.max(0,remain)/Math.max(1,remDays)):0,done=has?vals[d]:0;
      doneB=r6(doneB+done);
      rows.push({base:working?shareOf(m,d):0,carryIn:0,done,mode:lim?'limit':'target',plan,remain,remDays,
        carryOut:r6(lim?Math.max(0,doneB-eff):Math.max(0,eff-doneB)),surplus:r6(Math.max(0,lim?plan-done:done-plan)),
        diff:r6(lim?plan-done:done-plan),date:d,working,actual:has?done:null,missing:!has&&d<t0,pending:!has&&d>=t0});
    }
    const total=sumIn(R.from,R.to);
    carry=r6(lim?Math.max(0,total-eff):Math.max(0,eff-total));
    from=addDays(R.to,1);
  }
  return rows;
}
function calc(m,vals,upto,t0){
  if(isPeriodic(m))return calcPeriods(m,vals,upto,t0);
  if(isDynamic(m))return calcDynamic(m,vals,upto,t0);
  const rows=[];let carry=r6(Number(m.open)||0);
  const end=m.end&&m.end<upto?m.end:upto;
  vals=vals||{};
  for(let d=m.start;d<=end;d=addDays(d,1)){
    const working=m.days.includes(pd(d).getDay()),has=vals[d]!==undefined;
    if(!working&&!has)continue;
    const base=working?shareOf(m,d):0,done=has?vals[d]:0;
    const row=rowOf(m,{date:d,working,actual:has?vals[d]:null,missing:!has&&d<t0,pending:!has&&d>=t0},base,carry,done);
    rows.push(row);carry=row.carryOut;
  }
  return rows;
}
/* keyingi reja/limit: kunlik uchun keyingi ish kuni, haftalik/oylik uchun keyingi davr */
function nextPlan(m,vals,d,t0){
  const L=entryOf(m);
  if(L!=='day'){
    const cur=periodRange(m,d),rows=calcPeriods(m,vals,cur.from,t0);
    const carry=rows.length?rows[rows.length-1].carryOut:r6(Number(m.open)||0);
    const ns=addDays(cur.to,1);
    if(m.end&&ns>m.end)return null;
    const base=planOf(m,L,ns);
    return{date:ns,base,carry,plan:step(m,base,carry,0).plan,label:periodLabel(m,ns)};
  }
  if(isDynamic(m)){
    for(let i=1;i<=14;i++){
      const n=addDays(d,i);
      if(m.end&&n>m.end)return null;
      if(m.days.includes(pd(n).getDay())){
        const row=calcDynamic(m,vals,n,t0).find(x=>x.date===n);
        return row?{date:n,base:row.base,carry:0,plan:row.plan}:null;
      }
    }
    return null;
  }
  const rows=calc(m,vals,d,t0);
  const carry=rows.length?rows[rows.length-1].carryOut:r6(Number(m.open)||0);
  for(let i=1;i<=14;i++){
    const n=addDays(d,i);
    if(m.end&&n>m.end)return null;
    if(m.days.includes(pd(n).getDay())){const base=shareOf(m,n);return{date:n,base,carry,plan:step(m,base,carry,0).plan}}
  }
  return null;
}
/* d kuni (haftalik/oylik uchun d joylashgan davr) uchun to'liq ma'lumot */
function dayInfo(m,vals,d,t0){
  if(isPeriodic(m)){
    const r=periodRange(m,d);
    if(r.to<m.start)return{state:'before'};
    if(m.end&&r.from>m.end)return{state:'ended'};
    const row=calcPeriods(m,vals,r.from,t0).find(x=>x.date===r.from);
    return row?{state:'ok',row}:{state:'before'};
  }
  if(d<m.start)return{state:'before'};
  if(m.end&&d>m.end)return{state:'ended'};
  const rows=calc(m,vals,d,t0);
  const row=rows.find(r=>r.date===d);
  if(row)return{state:'ok',row};
  const prev=rows.length?rows[rows.length-1].carryOut:r6(Number(m.open)||0);
  if(isDynamic(m))return{state:'ok',row:{date:d,working:false,base:0,carryIn:0,plan:0,remain:prev,remDays:0,done:0,mode:isLimit(m)?'limit':'target',actual:null,missing:false,pending:d>=t0,surplus:0,diff:0,carryOut:prev}};
  return{state:'ok',row:rowOf(m,{date:d,working:false,actual:null,missing:false,pending:d>=t0},0,prev,0)};
}
/* fakt kiritiladigan darajadan farqli daraja uchun ko'rinish: reja, bajarilgani va qolgani */
function levelView(m,vals,level,d,t0){
  const r=rangeOf(level,d),plan=planOf(m,level,d);
  let done=0,has=false;for(const k in (vals||{}))if(k>=r.from&&k<=r.to){done+=vals[k];has=true}
  done=r6(done);
  const stop=m.end&&m.end<r.to?m.end:r.to,from=d<t0?d:t0;
  let daysLeft=0;for(let x=addDays(from,1);x<=stop;x=addDays(x,1))if(m.days.includes(pd(x).getDay()))daysLeft++;
  const left=r6(Math.max(0,plan-done)),over=r6(Math.max(0,done-plan));
  return{range:r,plan,done,has,left,over,daysLeft,perDay:daysLeft>0?r6(left/daysLeft):null,limit:isLimit(m),
    active:r.to>=m.start&&(!m.end||r.from<=m.end)};
}

/* davr statistikasi: me'yor/limit yig'indisi, fakt yig'indisi, farq (musbat = yaxshi), qoldiq */
function periodStat(m,vals,from,to,t0){
  const rows=calc(m,vals,to,t0).filter(r=>(r.end||r.date)>=from);
  const counted=rows.filter(r=>!r.pending);
  const sumBase=r6(counted.reduce((a,r)=>a+r.base,0)),sumDone=r6(counted.reduce((a,r)=>a+r.done,0));
  const lim=isLimit(m);
  return{rows,sumBase,sumDone,limit:lim,gap:lim?r6(sumBase-sumDone):r6(sumDone-sumBase),
    pct:sumBase>0?Math.round(sumDone/sumBase*100):null,
    debt:counted.length?counted[counted.length-1].carryOut:(rows.length?rows[0].carryIn:0),
    missing:rows.filter(r=>r.missing).length};
}
function gapText(m,g){
  if(isLimit(m))return g<0?'limitdan oshgan: '+withUnit(m,-g):g>0?'limit ichida, qoldi: '+withUnit(m,g):'limitga yetgan';
  return g<0?'rejadan ortda: '+withUnit(m,-g):g>0?'rejadan oldinda: +'+withUnit(m,g):'reja bo\'yicha';
}
/* ---- hisobot ---- */
function buildReport(S,from,to,t0){
  const emps=S.emps.map(e=>{
    const ms=S.metrics.filter(m=>m.emp===e.id).map(m=>Object.assign({m},periodStat(m,S.vals[m.id],from,to,t0))).filter(x=>x.rows.length)
      .sort((a,b)=>KIND_ORDER[kindOf(a.m)]-KIND_ORDER[kindOf(b.m)]);
    const ts=S.tasks.filter(t=>t.emp===e.id&&t.due>=from&&t.due<=to).sort((a,b)=>a.due.localeCompare(b.due));
    const tdone=ts.filter(t=>t.done).length;
    return{e,ms,ts,tdone,tpct:ts.length?Math.round(tdone/ts.length*100):null};
  }).filter(x=>x.ms.length||x.ts.length);
  return{from,to,emps,generated:t0};
}
function rowStatus(m,r){
  if(r.actual==null)return r.missing?'Kiritilmagan (0 hisoblandi)':'Kiritilmagan';
  if(isLimit(m))return r.diff>=0?'Limit ichida'+(r.diff>0?' (qoldi '+fmtN(r.diff)+')':''):'Limitdan oshdi: +'+fmtN(-r.diff)+' ('+nextWord(m)+' limitdan ayriladi)';
  if(r.actual>=r.plan)return r.surplus>0?'Bajarildi (+'+fmtN(r.surplus)+' ortiqcha)':'Bajarildi';
  return'Yetmadi: '+fmtN(r.plan-r.actual)+' '+nextWord(m)+' qo\'shiladi';
}
function taskStatus(t,t0){
  if(t.done)return'Bajarildi'+(t.doneAt?' ('+fmtD(t.doneAt)+')':'');
  return t.due<t0?'Bajarilmadi (kechikdi)':'Jarayonda';
}
/* hisobot yorliqlari: reja yoki limit */
function labelsOf(m){
  return isLimit(m)?{base:'Limit',done:'Ishlatildi',pct:'Limit sarfi',gap:'Limitdan farq',carry:'Keyingidan ayriladi'}
                   :{base:'Me\'yor',done:'Fakt',pct:'Bajarilish',gap:'Rejadan farq',carry:'Keyingiga qo\'shiladi'};
}


/* ---- Word (.docx) ---- */
const WNS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const CW=10106; /* A4 da matn kengligi (twips) */
const WC={head:'1D5FA8',soft:'E6EEF9',sum:'F3F5F8',ink:'17202E',mute:'667186',line:'BFC6D2',
  ok:['E3F4E8','15803D'],bad:['FBE7E7','B91C1C'],warn:['FBF0DC','A15C07']};
function X(s){return String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function wRun(t,o={}){
  const rp=(o.b?'<w:b/>':'')+(o.i?'<w:i/>':'')+(o.color?'<w:color w:val="'+o.color+'"/>':'')+(o.sz?'<w:sz w:val="'+o.sz+'"/><w:szCs w:val="'+o.sz+'"/>':'');
  return'<w:r>'+(rp?'<w:rPr>'+rp+'</w:rPr>':'')+'<w:t xml:space="preserve">'+X(t)+'</w:t></w:r>';
}
/* text: satr yoki [{t,b,color,sz}] ro'yxati */
function wPara(text,o={}){
  const pp=(o.style?'<w:pStyle w:val="'+o.style+'"/>':'')+(o.keep?'<w:keepNext/>':'')+(o.pb?'<w:pageBreakBefore/>':'')
    +((o.before!=null||o.after!=null)?'<w:spacing'+(o.before!=null?' w:before="'+o.before+'"':'')+(o.after!=null?' w:after="'+o.after+'"':'')+'/>':'')
    +(o.jc?'<w:jc w:val="'+o.jc+'"/>':'');
  const runs=text===''||text==null?'':(Array.isArray(text)?text.map(x=>wRun(x.t,Object.assign({},o,x))).join(''):wRun(text,o));
  return'<w:p>'+(pp?'<w:pPr>'+pp+'</w:pPr>':'')+runs+'</w:p>';
}
function wCell(w,paras,o={}){
  return'<w:tc><w:tcPr><w:tcW w:w="'+w+'" w:type="dxa"/>'+(o.fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+o.fill+'"/>':'')+(o.mid?'<w:vAlign w:val="center"/>':'')+'</w:tcPr>'+paras+'</w:tc>';
}
/* cols: ustun kengliklari; head: [{t,r}] yoki null; rows: [[{t,b,color,fill,r,c,sz,paras}]]; o: {keep,padV,padH,noBorder} */
function wTable(cols,head,rows,o={}){
  const total=cols.reduce((a,b)=>a+b,0),pv=o.padV??50,ph=o.padH??90;
  const bd=o.noBorder?'':'<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(k=>'<w:'+k+' w:val="single" w:sz="4" w:space="0" w:color="'+WC.line+'"/>').join('')+'</w:tblBorders>';
  let x='<w:tbl><w:tblPr><w:tblW w:w="'+total+'" w:type="dxa"/>'+bd+'<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="'+pv+'" w:type="dxa"/><w:left w:w="'+ph+'" w:type="dxa"/><w:bottom w:w="'+pv+'" w:type="dxa"/><w:right w:w="'+ph+'" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+cols.map(c=>'<w:gridCol w:w="'+c+'"/>').join('')+'</w:tblGrid>';
  const jc=(c,h)=>(c.r??(h&&h.r))?'right':(c.c?'center':null);
  if(head)x+='<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>'+head.map((h,i)=>wCell(cols[i],wPara(h.t,{b:true,sz:18,color:'FFFFFF',after:0,keep:o.keep,jc:jc(h,h)}),{fill:WC.head,mid:true})).join('')+'</w:tr>';
  rows.forEach((r,ri)=>{
    const last=ri===rows.length-1;
    x+='<w:tr><w:trPr><w:cantSplit/></w:trPr>'+r.map((c,i)=>wCell(cols[i],c.paras||wPara(c.t,{b:c.b,i:c.i,color:c.color,sz:c.sz||19,after:0,keep:o.keep&&!last,jc:jc(c,head&&head[i])}),{fill:c.fill,mid:true})).join('')+'</w:tr>';
  });
  return x+'</w:tbl>'+wPara('',{after:o.after??80});
}
const sgn=v=>v>0?'+'+fmtN(v):v<0?'−'+fmtN(-v):'0';
function pctStyle(p,lim){
  if(p==null)return{t:'—',r:1,color:WC.mute};
  const c=lim?(p<=100?WC.ok:p<=120?WC.warn:WC.bad):(p>=100?WC.ok:p>=80?WC.warn:WC.bad);
  return{t:p+'%',r:1,b:1,fill:c[0],color:c[1]};
}
function gapStyle(g){return{t:sgn(g),r:1,b:1,color:g<0?WC.bad[1]:g>0?WC.ok[1]:WC.mute}}
function rowState(r){
  if(r.actual==null)return r.missing?{t:'Kiritilmagan',fill:WC.warn[0],color:WC.warn[1]}:{t:'Kutilmoqda',color:WC.mute};
  if(r.mode==='limit')return r.diff>=0?{t:'Limit ichida',color:WC.ok[1]}:{t:'Limitdan oshdi',fill:WC.bad[0],color:WC.bad[1]};
  return r.actual>=r.plan?{t:'Bajarildi',color:WC.ok[1]}:{t:'Yetmadi',fill:WC.bad[0],color:WC.bad[1]};
}
function docxFiles(rep){
  let b='';
  const period=fmtD(rep.from)+' — '+fmtD(rep.to);
  /* sarlavha bandi */
  b+=wTable([CW],null,[[{paras:wPara('Xodimlar ish natijalari hisoboti',{b:1,sz:38,color:'FFFFFF',after:60})
      +wPara([{t:'Davr: '+period,b:1},{t:'      Tayyorlangan sana: '+fmtD(rep.generated)}],{sz:21,color:'DCE7F7',after:0}),fill:WC.head}]],{noBorder:1,padV:200,padH:260,after:120});

  if(!rep.emps.length){return pack(rep,b+wPara('Tanlangan davrda ma\'lumot yo\'q.'))}

  /* umumiy natija */
  b+=wPara('Umumiy natija',{style:'Heading1',before:120});
  const withM=rep.emps.filter(x=>x.ms.length);
  if(withM.length){
    b+=wPara('Kunlik ko\'rsatkichlar',{style:'Heading2'});
    const rows=[];
    withM.forEach(x=>x.ms.forEach((k,i)=>rows.push([
      {t:i===0?x.e.name:'',b:1},
      {t:k.m.name+(k.m.unit?' ('+k.m.unit+')':'')},{t:KIND_NAME[kindOf(k.m)]+(k.limit?' · limit':''),color:WC.mute},
      {t:fmtN(k.sumBase),r:1},{t:fmtN(k.sumDone),r:1},pctStyle(k.pct,k.limit),gapStyle(k.gap),
      {t:k.debt>0?fmtN(k.debt):'—',r:1,color:k.debt>0?WC.bad[1]:WC.mute}])));
    b+=wTable([2000,1800,950,950,950,1100,1100,1256],
      [{t:'Xodim'},{t:'Ko\'rsatkich'},{t:'Turi'},{t:'Reja/limit',r:1},{t:'Fakt',r:1},{t:'Bajarilish',r:1},{t:'Farq',r:1},{t:'Keyingiga',r:1}],rows,{keep:1});
    const behind=[];withM.forEach(x=>x.ms.forEach(k=>{if(k.gap<0)behind.push({n:x.e.name,k})}));
    behind.sort((a,c)=>a.k.gap-c.k.gap);
    b+=wPara('Diqqat talab qiladigan ko\'rsatkichlar',{style:'Heading2'});
    b+=behind.length?behind.slice(0,6).map(z=>wPara([{t:'•  '+z.n+', '+z.k.m.name+' ('+KIND_NAME[kindOf(z.k.m)].toLowerCase()+'): ',b:1},{t:withUnit(z.k.m,-z.k.gap)+(z.k.limit?' limitdan oshgan':' ortda'),color:WC.bad[1],b:1}],{sz:21,after:30})).join('')
      :wPara('Hamma ko\'rsatkich reja bo\'yicha yoki oldinda, limitlar ichida.',{sz:21,color:WC.ok[1],b:1});
  }
  const withT=rep.emps.filter(x=>x.ts.length);
  if(withT.length){
    b+=wPara('Topshiriqlar (bajardi / bajarmadi)',{style:'Heading2',before:240});
    b+=wTable([3300,1300,1500,1700,1306,1000],
      [{t:'Xodim'},{t:'Jami',r:1},{t:'Bajarilgan',r:1},{t:'Bajarilmagan',r:1},{t:'Shundan kechikkan',r:1},{t:'Foiz',r:1}],
      withT.map(x=>{const late=x.ts.filter(t=>!t.done&&t.due<rep.generated).length;
        return[{t:x.e.name,b:1},{t:String(x.ts.length),r:1},{t:String(x.tdone),r:1},{t:String(x.ts.length-x.tdone),r:1},
          {t:String(late),r:1,color:late?WC.bad[1]:WC.mute},pctStyle(x.tpct)]}),{keep:1});
  }
  b+=wPara('Hisoblash qoidasi: reja bo\'yicha yetmagan qism keyingi kunga (haftalik ko\'rsatkichda keyingi haftaga, oylikda keyingi oyga) qo\'shiladi, ortiqcha qism keyingi rejani kamaytirmaydi. Limit bo\'yicha oshgan qism keyingi limitdan ayriladi, ishlatilmagan qism qo\'shilmaydi. Fakt kiritilmagan o\'tgan davr 0 deb olinadi. "Farq" butun davr uchun: reja bo\'yicha fakt − me\'yor, limit bo\'yicha limit − ishlatilgan (manfiy bo\'lsa, yomon).',{sz:17,color:WC.mute,i:1,before:120});

  /* har bir xodim alohida sahifada */
  rep.emps.forEach(x=>{
    b+=wPara(x.e.name,{style:'Heading1',pb:1});
    x.ms.forEach(k=>{
      b+=wPara(k.m.name+(k.m.unit?' ('+k.m.unit+')':'')+'  ·  '+planWord(k.m)+': '+fmtN(targetOn(k.m,rep.to)),{style:'Heading2',keep:1});
      const card=(lab,val,color)=>({paras:wPara(lab,{sz:16,color:WC.mute,b:1,after:0,keep:1})+wPara(val,{sz:28,b:1,color:color||WC.ink,after:0,keep:1}),fill:WC.sum});
      const pc=pctStyle(k.pct,k.limit),lb=labelsOf(k.m);
      b+=wTable([2021,2021,2021,2021,2022],null,[[
        card(lb.base.toUpperCase()+' (JAMI)',fmtN(k.sumBase)),card(lb.done.toUpperCase()+(k.limit?'':' (JAMI)'),fmtN(k.sumDone)),
        card(lb.pct.toUpperCase(),k.pct==null?'—':k.pct+'%',pc.color),
        card(lb.gap.toUpperCase(),sgn(k.gap),k.gap<0?WC.bad[1]:k.gap>0?WC.ok[1]:WC.ink),
        card(lb.carry.toUpperCase(),k.debt>0?fmtN(k.debt):'—',k.debt>0?WC.bad[1]:WC.ink)]],{noBorder:1,padV:90,padH:140,keep:1,after:100});
      b+=wTable([2300,900,1200,900,900,1000,2906],
        [{t:entryOf(k.m)==='week'?'Hafta':entryOf(k.m)==='month'?'Oy':'Sana'},{t:k.limit?'Limit':'Me\'yor',r:1},{t:k.limit?'Oshgan':'O\'tgan qarz',r:1},{t:k.limit?'Ruxsat':'Reja',r:1},{t:k.limit?'Ishlatildi':'Fakt',r:1},{t:'Farq',r:1},{t:'Holat'}],
        k.rows.map(r=>{const st=rowState(r);
          return[{t:rowLabel(k.m,r)},{t:fmtN(r.base)},{t:r.carryIn?fmtN(r.carryIn):'—',color:r.carryIn?WC.bad[1]:WC.mute},{t:fmtN(r.plan)},
            {t:r.actual==null?'—':fmtN(r.actual),b:1},
            r.actual==null?{t:'—',r:1,color:WC.mute}:gapStyle(r.diff),
            {t:st.t+(r.actual!=null&&r.diff<0?(k.limit?' ('+nextWord(k.m)+' limitdan '+fmtN(-r.diff)+' ayriladi)':' ('+nextWord(k.m)+' '+fmtN(-r.diff)+' qo\'shiladi)'):''),fill:st.fill,color:st.color}]})
          .concat([[{t:'Jami',b:1,fill:WC.sum},{t:fmtN(k.sumBase),b:1,fill:WC.sum,r:1},{t:'',fill:WC.sum},{t:'',fill:WC.sum},
            {t:fmtN(k.sumDone),b:1,fill:WC.sum,r:1},{t:sgn(k.gap),b:1,fill:WC.sum,r:1,color:k.gap<0?WC.bad[1]:k.gap>0?WC.ok[1]:WC.ink},
            {t:k.pct==null?'—':k.pct+(k.limit?'% sarflandi':'% bajarildi')+(k.missing?', kiritilmagan: '+k.missing+(isPeriodic(k.m)?' davr':' kun'):''),b:1,fill:WC.sum}]]),
        {keep:k.rows.length<=34,after:140});
    });
    if(x.ts.length){
      b+=wPara('Topshiriqlar: '+x.tdone+' / '+x.ts.length+' bajarilgan ('+x.tpct+'%)',{style:'Heading2',keep:1});
      b+=wTable([1700,4300,2100,2006],[{t:'Muddat'},{t:'Topshiriq'},{t:'Holat'},{t:'Izoh'}],
        x.ts.map(t=>{const late=!t.done&&t.due<rep.generated;
          return[{t:fmtDW(t.due)},{t:t.title},
            {t:t.done?'Bajarildi'+(t.doneAt?' ('+fmtD(t.doneAt)+')':''):(late?'Bajarilmadi (kechikdi)':'Jarayonda'),
              fill:t.done?WC.ok[0]:late?WC.bad[0]:null,color:t.done?WC.ok[1]:late?WC.bad[1]:WC.mute},
            {t:t.note||'',i:1,color:WC.mute}]}));
    }
  });
  return pack(rep,b);
}
function pack(rep,body){
  const head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sect='<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>';
  const fld=(c,v)=>'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> '+c+' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>'+v+'</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const files={};
  files['[Content_Types].xml']=head+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  files['_rels/.rels']=head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  files['docProps/core.xml']=head+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Xodimlar ish natijalari hisoboti '+X(fmtD(rep.from)+' - '+fmtD(rep.to))+'</dc:title><dc:creator>Xodimlar nazorati</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+rep.generated+'T00:00:00Z</dcterms:created></cp:coreProperties>';
  files['word/_rels/document.xml.rels']=head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
  files['word/document.xml']=head+'<w:document '+WNS+'><w:body>'+body+sect+'</w:body></w:document>';
  files['word/footer1.xml']=head+'<w:ftr '+WNS+'><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Xodimlar nazorati  ·  '+X(fmtD(rep.from)+' — '+fmtD(rep.to))+'  ·  Sahifa </w:t></w:r>'+fld('PAGE','1')+'<w:r><w:t xml:space="preserve"> / </w:t></w:r>'+fld('NUMPAGES','1')+'</w:p></w:ftr>';
  files['word/styles.xml']=head+'<w:styles '+WNS+'><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="uz-Latn-UZ"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    +'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="17202E"/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1D5FA8"/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="667186"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style></w:styles>';
  return files;
}
