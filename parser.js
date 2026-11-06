// Разбор PDF-выписок Т-Банка и Альфа-Банка — работает на устройстве
(function(root){
const DATE=/^\d{2}\.\d{2}\.\d{4}$/, TIME=/^\d{2}:\d{2}$/;
function num(s){return parseFloat(String(s).replace(/[\s\u00a0₽]/g,'').replace(',','.'))}
function parsePageItems(items, cols){
  // items: [{x,y,s}]
  const rows=items.filter(i=>i.x<cols.post-5&&DATE.test(i.s)).map(i=>i.y).sort((a,b)=>b-a);
  const uniq=[];for(const y of rows)if(!uniq.length||Math.abs(uniq[uniq.length-1]-y)>2)uniq.push(y);
  const out=[];
  uniq.forEach((y,k)=>{
    const bottom=k+1<uniq.length?uniq[k+1]+2:y-48;
    const it=items.filter(i=>i.y<=y+2&&i.y>bottom).sort((a,b)=>b.y-a.y||a.x-b.x);
    const col=(a,b)=>it.filter(i=>i.x>=a-3&&i.x<b-3);
    const d1=col(0,cols.post), d2=col(cols.post,cols.amt), a1=col(cols.amt,cols.camt), de=col(cols.desc,cols.card), ca=col(cols.card,9999);
    const date=d1.find(i=>DATE.test(i.s)), time=d1.find(i=>TIME.test(i.s));
    const amtStr=a1.filter(i=>i.s!=='₽').map(i=>i.s).join(' ');
    if(!date||!/[+-]/.test(amtStr))return;
    let desc=[],lineY=null;
    for(const i of de){ if(lineY!==null&&Math.abs(i.y-lineY)<2)desc[desc.length-1]+=' '+i.s; else desc.push(i.s); lineY=i.y; }
    let text=desc.join(' ').replace(/\s+/g,' ').trim(); let card=(ca[0]||{}).s||'';
    const m=text.match(/^(.*?)\s(\d{4})(\s.*)?$/); // склейка «… 1234» в описании
    if(!card&&m&&m[2]){card=m[2];text=(m[1]+(m[3]||'')).trim()}
    const [dd,mm,yy]=date.s.split('.');
    out.push({date:`${yy}-${mm}-${dd}`,time:time?time.s:'00:00',amount:num(amtStr),desc:text,card:card.trim()});
  });
  return out;
}
async function parseTbankPdf(pdfjs, data, doc0){
  const doc=doc0||await pdfjs.getDocument({data}).promise;
  let cols={post:126,amt:199,camt:294,desc:389,card:499}, all=[], totals={}, period=null, headerOk=false;
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p); const tc=await page.getTextContent();
    const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({x:i.transform[4],y:i.transform[5],s:i.str.trim()}));
    const h=n=>items.find(i=>i.s===n);
    if(h('Описание')&&h('Номер')&&h('Дата и время')){headerOk=true;cols={post:h('Дата').x,amt:h('Сумма в валюте').x,camt:h('Сумма операции').x,desc:h('Описание').x,card:h('Номер').x}}
    const joined=items.map(i=>i.s).join(' ');
    const pm=joined.match(/за период с (\d{2}\.\d{2}\.\d{4}) по (\d{2}\.\d{2}\.\d{4})/); if(pm)period=[pm[1],pm[2]];
    items.forEach((i,k)=>{ if(i.s.startsWith('Пополнения:')||i.s.startsWith('Расходы:')){
      const key=i.s.startsWith('Поп')?'in':'out'; let v=i.s.split(':')[1];
      if(!v||!/\d/.test(v)){v=items.filter(j=>Math.abs(j.y-i.y)<2&&j.x>i.x).sort((a,b)=>a.x-b.x).map(j=>j.s).join(' ')}
      totals[key]=num(v);
    }});
    all=all.concat(parsePageItems(items.filter(i=>i.y>60),cols));
  }
  if(!headerOk)throw new Error('Это не похоже на выписку Т-Банка «Справка о движении средств».');
  const inc=all.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0), exp=-all.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
  const r2=x=>Math.round(x*100)/100;
  return {tx:all,period,totals,parsed:{in:r2(inc),out:r2(exp)},ok:totals.in!=null&&Math.abs(r2(inc)-totals.in)<0.01&&Math.abs(r2(exp)-totals.out)<0.01};
}

/* ---------- Альфа-Банк: «Выписка по счёту» (расчётный счёт, страницы повёрнуты) ---------- */
const AMT=/^\d{1,3}( \d{3})*,\d{2}$/;
function shortOrg(n){
  if(/АЛЬФА-БАНК/i.test(n))return 'Альфа-Банк';
  return n.replace(/ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ/i,'ООО').replace(/АКЦИОНЕРНОЕ ОБЩЕСТВО/i,'АО').replace(/ПУБЛИЧНОЕ АО/i,'ПАО')
    .replace(/ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ/i,'ИП').replace(/\s+/g,' ').trim();
}
function alfaDesc(amount, name, pu, own){
  const card=(pu.match(/по карте \d+\+*(\d{4})/)||pu.match(/к\.\d+\+(\d{4})/)||pu.match(/^\d{4}\+(\d{4})/)||[])[1]||'';
  const tu=pu.match(/\\RU\\([^\\]+)\\(.+?)(?: по чеку|,\d\d\.\d\d\.\d\d)/);
  let m=tu?tu[2].replace(/^YANDEX (\d{4}) (.+)$/,'YANDEX*$1*$2'):'';
  const sameOwner=own&&shortOrg(name)===own;
  let d;
  if(/^Возвр/.test(pu)&&tu) d='Возврат средств по оплате '+m;
  else if(tu&&amount<0) d='Оплата в '+m;
  else if(/Внес\.ср|Взнос наличн/i.test(pu)) d='Внесение наличных · '+pu;
  else if(/^Ком(ис|-я|иссия)|^Погашение Комиссия|^Плата за/i.test(pu)) d='Комиссия банка · '+pu;
  else if(/налог|Взносы на обязательное|Взыскание (пени|недоимки)|страховые взносы/i.test(pu)) d='Оплата услуг Налоги и взносы · '+pu;
  else if(/между своими|Внутренне? перемещение/i.test(pu)||sameOwner) d='Перевод себе · '+pu;
  else if(/кредит|основного долга|процентов по/i.test(pu)&&/Альфа-Банк/.test(shortOrg(name))) d=(amount>0?'Поступление: ':'Платёж: ')+'Альфа-Банк — кредит · '+pu;
  else if(amount>0) d=(/Альфа-Банк/.test(shortOrg(name))?'Поступление: ':'Оплата от клиента: ')+shortOrg(name)+' · '+pu;
  else d='Платёж: '+(/заработной платы/i.test(pu)&&/Альфа-Банк/.test(shortOrg(name))?'Зарплата сотрудникам':shortOrg(name))+' · '+pu;
  return {desc:d.replace(/\s+/g,' ').trim(),card};
}
async function parseAlfaPdf(pdfjs, doc){
  const all=[];let period=null,totals={},acc='',owner='';
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);const tc=await page.getTextContent();
    const it=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>{const t=i.transform;return Math.abs(t[0])<0.01?{y:t[4],x:t[5],s:i.str.trim()}:{y:-t[5],x:t[4],s:i.str.trim()}});
    if(p===1){
      const j=it.map(i=>i.s).join(' | ');
      const pm=j.match(/c (\d{2}\.\d{2}\.\d{4}) по (\d{2}\.\d{2}\.\d{4})/); if(pm)period=[pm[1],pm[2]];
      const am=j.match(/Счёт: \| ([\d ]{20,})/); if(am)acc=am[1].replace(/\s/g,'');
      const om=j.match(/Владелец счёта: \|.*?\| ([^|]+?) \|/); if(om)owner=shortOrg(om[1]);
      const own=it.find(i=>i.s==='Владелец счёта:'); if(own){const v=it.filter(i=>Math.abs(i.y-own.y)<6&&i.x>own.x+50&&i.x<900).sort((a,b)=>a.x-b.x)[0]; if(v)owner=shortOrg(v.s);}
      const acI=it.find(i=>i.s==='Счёт:'); if(acI){const v=it.filter(i=>Math.abs(i.y-acI.y)<6&&i.x>acI.x+50&&i.x<900)[0]; if(v)acc=v.s.replace(/\s/g,'');}
      const val=lbl=>{const a=it.find(i=>i.s===lbl);if(!a)return null;const v=it.filter(i=>Math.abs(i.y-a.y)<6&&i.x>a.x&&/RUR/.test(i.s)).sort((x,y)=>x.x-y.x)[0];return v?num(v.s.replace('RUR','')):null};
      totals={out:val('Обороты по дебету:'),in:val('Обороты по кредиту:')};
    }
    const hd=it.find(i=>i.s==='Дата'), H=n=>(it.find(i=>i.s===n)||{}).x;
    if(!hd)continue;
    const xDeb=H('Дебет')||259, xCr=H('Кредит')||415, xNm=H('Наименование, ИНН, КПП, счёт')||565, xBk=H('Банк (БИК, наименование)')||891, xPu=H('Назначение платежа')||1246, xDoc=H('Документ')||1595;
    const cutAmt=(xDeb+xCr)/2+40, nm0=xNm-60, bk0=xBk-75, pu0=xPu-120, pu1=xDoc-30;
    const rows=it.filter(i=>i.y>hd.y+15&&i.x<xDeb-140&&DATE.test(i.s)).sort((a,b)=>a.y-b.y);
    rows.forEach((r,k)=>{
      const y0=r.y-6,y1=k+1<rows.length?rows[k+1].y-6:1e9;
      const band=it.filter(i=>i.y>=y0&&i.y<y1&&!/^стр\. \d+$/.test(i.s)).sort((a,b)=>a.y-b.y||a.x-b.x);
      const a=band.find(i=>i.x>xDeb-80&&i.x<nm0&&AMT.test(i.s)); if(!a)return;
      const amount=(a.x<cutAmt?-1:1)*num(a.s);
      const name=band.filter(i=>i.x>=nm0&&i.x<bk0&&!/^(ИНН|КПП|Счёт):/.test(i.s)).map(i=>i.s).join(' ');
      const pu=band.filter(i=>i.x>=pu0&&i.x<pu1).map(i=>i.s).join(' ').replace(/\s+/g,' ').trim();
      const no=(band.find(i=>i.x>xDeb-160&&i.x<xDeb-20&&/^\d+$/.test(i.s))||{}).s||'';
      const [dd,mm,yy]=r.s.split('.');
      const dsc=alfaDesc(amount,name,pu,owner);
      all.push({date:`${yy}-${mm}-${dd}`,time:'00:00',amount,desc:dsc.desc,card:dsc.card,doc:no});
    });
  }
  const r2=x=>Math.round(x*100)/100;
  const inc=all.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0), exp=-all.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
  const id='alfa-'+(acc.slice(-4)||'0000');
  all.forEach(t=>{t.acc=id});
  return {bank:'Альфа-Банк',acc:{id,label:'Альфа ••'+(acc.slice(-4)||'')+(owner?' · '+owner:'')},tx:all,period,totals,parsed:{in:r2(inc),out:r2(exp)},
    ok:totals.in!=null&&Math.abs(r2(inc)-totals.in)<0.01&&Math.abs(r2(exp)-totals.out)<0.01};
}
async function parseAnyPdf(pdfjs, data){
  const doc=await pdfjs.getDocument({data}).promise;
  const p1=await (await doc.getPage(1)).getTextContent(); const j=p1.items.map(i=>i.str).join(' ');
  if(/АЛЬФА-БАНК/i.test(j)&&/Выписка по сч[её]ту/.test(j)) return parseAlfaPdf(pdfjs, doc);
  if(/Сбер/i.test(j)&&!/Т-Банк|ТБанк|Тинькофф/i.test(j)) throw new Error('Выписки Сбербанка пока не поддерживаются — пришлите пример, и я добавлю.');
  const res=await parseTbankPdf(pdfjs, data, doc); res.bank='Т-Банк'; res.acc={id:'tbank',label:'Т-Банк'}; return res;
}
const api={parseTbankPdf,parseAlfaPdf,parseAnyPdf,parsePageItems,alfaDesc};
if(typeof module!=='undefined')module.exports=api; else root.TbankParser=api;
})(this);
