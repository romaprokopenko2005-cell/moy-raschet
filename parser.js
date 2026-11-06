// Разбор PDF-выписки Т-Банка «Справка о движении средств» — работает на устройстве
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
async function parseTbankPdf(pdfjs, data){
  const doc=await pdfjs.getDocument({data}).promise;
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
const api={parseTbankPdf,parsePageItems};
if(typeof module!=='undefined')module.exports=api; else root.TbankParser=api;
})(this);
