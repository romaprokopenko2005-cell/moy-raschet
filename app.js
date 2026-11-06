(function(){
'use strict';
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var rub = function(v, sign){ var a = Math.abs(v), s = a.toLocaleString('ru-RU', {minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2}) + ' ₽'; return sign ? (v > 0 ? '+' : v < 0 ? '−' : '') + s : (v < 0 ? '−' + s : s); };
var rub0 = function(v){ return Math.round(v).toLocaleString('ru-RU') + ' ₽'; };
var pct = function(a, b){ return b ? (a / b * 100).toLocaleString('ru-RU', {maximumFractionDigits: 1}) + '%' : '—'; };
var MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
var MONTHS_G = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
var MON_S = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var WD = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

/* ---------- хранилище (IndexedDB, запасной вариант — память) ---------- */
var DB = null, mem = {};
function openDB(){
  return new Promise(function(res){
    try {
      var rq = indexedDB.open('moy-raschet', 1);
      rq.onupgradeneeded = function(){ rq.result.createObjectStore('kv'); };
      rq.onsuccess = function(){ DB = rq.result; res(); };
      rq.onerror = function(){ res(); };
    } catch(e){ res(); }
  });
}
function dbGet(k){ return new Promise(function(res){ if(!DB) return res(mem[k]); var t = DB.transaction('kv').objectStore('kv').get(k); t.onsuccess = function(){ res(t.result); }; t.onerror = function(){ res(undefined); }; }); }
function dbSet(k, v){ return new Promise(function(res, rej){ if(!DB){ mem[k] = v; return res(); } var tr = DB.transaction('kv', 'readwrite'); tr.objectStore('kv').put(v, k); tr.oncomplete = function(){ res(); }; tr.onerror = function(){ rej(tr.error); }; }); }

var S = { tx: [], rules: {}, overrides: {}, names: {}, imports: [], limits: {}, goals: [], customCats: [], catColors: {}, accounts: {}, accSel: 'all' };
/* ---------- счета: Т-Банк, Альфа и т. д. ---------- */
function accOf(t){ return t.acc || 'tbank'; }
function accLabel(id){ return (S.accounts && S.accounts[id]) || (id === 'tbank' ? 'Т-Банк' : id); }
function accList(){ var seen = {}; S.tx.forEach(function(t){ seen[accOf(t)] = (seen[accOf(t)] || 0) + 1; }); return Object.keys(seen).map(function(id){ return { id: id, n: seen[id], label: accLabel(id) }; }).sort(function(a, b){ return a.id === 'tbank' ? -1 : b.id === 'tbank' ? 1 : b.n - a.n; }); }
var vtc = { k: null, v: [] };
function VT(){ var sel = S.accSel || 'all'; if (sel !== 'all' && !S.tx.some(function(t){ return accOf(t) === sel; })) sel = S.accSel = 'all'; var k = S.tx.length + '|' + sel + '|' + (S.tx[0] && S.tx[0].id) + '|' + (S.tx.length && S.tx[S.tx.length - 1].id); if (vtc.k === k && vtc.src === S.tx) return vtc.v; vtc = { k: k, src: S.tx, v: sel === 'all' ? S.tx : S.tx.filter(function(t){ return accOf(t) === sel; }) }; return vtc.v; }
var DEFAULT_OVERRIDES = {};
function preset(t){ return t.date === '2026-11-02' && t.time === '07:52' && t.amount === -990 && /Сервисы Яндекса/.test(t.desc) ? 'Подписки' : null; }
function save(){ return dbSet('state', S).catch(function(e){ toast('Не удалось сохранить: ' + e); }); }

/* ---------- обогащение операций ---------- */
var SPEND = { purchase: 1, fee: 1, refund: 1 };
function isOut(t){ return t.amount < 0 && (t.kind === 'transfer_out' || t.kind === 'self'); }
function enrich(t){
  t.kind = Cat.kindOf(t.desc, t.amount);
  t.merchant = Cat.merchant(t.desc);
  t.cp = Cat.counterparty(t.desc);
  t.cat = S.overrides[t.id] || preset(t) || S.rules[t.merchant] || (SPEND[t.kind] ? Cat.category(t.desc) : t.kind === 'cash_out' ? 'Наличные' : 'Переводы');
  t.spend = SPEND[t.kind] ? -t.amount : 0;
}
function keyOf(t){ return t.date + '|' + t.time + '|' + t.amount + '|' + t.desc + '|' + t.card + (t.acc ? '|' + t.acc : ''); }
function mergeTx(newTx){
  var have = {}, add = [], seen = {};
  S.tx.forEach(function(t){ var k = keyOf(t); have[k] = (have[k] || 0) + 1; });
  newTx.forEach(function(t){
    var k = keyOf(t); seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > (have[k] || 0)){ t.id = k + '#' + (seen[k] - 1); add.push(t); }
  });
  return add;
}

/* ---------- периоды ---------- */
var P = { mode: 'month', anchor: null, view: 'overview', cat: null, q: '' };
function ymd(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseD(s){ var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
function todayS(){ return ymd(new Date()); }
function range(mode, anchor){
  var d = parseD(anchor), s, e;
  if (mode === 'day'){ s = e = d; }
  else if (mode === 'week'){ var w = (d.getDay() + 6) % 7; s = new Date(d); s.setDate(d.getDate() - w); e = new Date(s); e.setDate(s.getDate() + 6); }
  else if (mode === 'month'){ s = new Date(d.getFullYear(), d.getMonth(), 1); e = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  else if (mode === 'year'){ s = new Date(d.getFullYear(), 0, 1); e = new Date(d.getFullYear(), 11, 31); }
  else { return { s: dataMin(), e: dataMax() }; }
  return { s: ymd(s), e: ymd(e) };
}
function shift(mode, anchor, n){
  var d = parseD(anchor);
  if (mode === 'day') d.setDate(d.getDate() + n);
  else if (mode === 'week') d.setDate(d.getDate() + 7 * n);
  else if (mode === 'month') d = new Date(d.getFullYear(), d.getMonth() + n, 1);
  else if (mode === 'year') d = new Date(d.getFullYear() + n, 0, 1);
  return ymd(d);
}
function label(mode, anchor){
  var r = range(mode, anchor), s = parseD(r.s), e = parseD(r.e);
  if (mode === 'day') return s.getDate() + ' ' + MONTHS_G[s.getMonth()] + ' ' + s.getFullYear() + ', ' + WD[(s.getDay() + 6) % 7].toLowerCase();
  if (mode === 'week') return s.getDate() + (s.getMonth() !== e.getMonth() ? ' ' + MON_S[s.getMonth()] : '') + ' – ' + e.getDate() + ' ' + MON_S[e.getMonth()] + ' ' + e.getFullYear();
  if (mode === 'month'){ var m = MONTHS[s.getMonth()]; return m[0].toUpperCase() + m.slice(1) + ' ' + s.getFullYear(); }
  if (mode === 'year') return s.getFullYear() + ' год';
  return 'Вся история';
}
function dataMin(){ var X = VT(); return X.length ? X.reduce(function(m, t){ return t.date < m ? t.date : m; }, '9999') : todayS(); }
function dataMax(){ var X = VT(); return X.length ? X.reduce(function(m, t){ return t.date > m ? t.date : m; }, '0000') : todayS(); }
function inR(r){ return VT().filter(function(t){ return t.date >= r.s && t.date <= r.e; }); }
function coverage(r){ var a = dataMin(), b = dataMax(); if (!VT().length || r.e < a || r.s > b) return 'none'; return (r.s < a || r.e > b) ? 'partial' : 'full'; }

/* ---------- агрегаты ---------- */
function sumSpend(list){ return list.reduce(function(s, t){ return s + t.spend; }, 0); }
function byCat(list){
  var m = {};
  list.forEach(function(t){ if (t.spend) m[t.cat] = (m[t.cat] || 0) + t.spend; });
  return Object.keys(m).map(function(k){ return { cat: k, v: m[k] }; }).filter(function(x){ return Math.abs(x.v) > 0.004; }).sort(function(a, b){ return b.v - a.v; });
}
function color(c){ if (S.catColors && S.catColors[c]) return S.catColors[c]; var u = (S.customCats || []).filter(function(x){ return x.name === c; })[0]; return u ? u.color : (Cat.COLORS[c] || '#999'); }
function catNames(){ return Cat.CATS.map(function(c){ return c[0]; }).concat((S.customCats || []).map(function(c){ return c.name; })); }

/* ---------- графики ---------- */
var charts = {};
function chart(id, cfg){ if (charts[id]) charts[id].destroy(); var el = document.getElementById(id); if (!el || !window.Chart) return null; charts[id] = new Chart(el, cfg); return charts[id]; }
if (window.Chart){
  Chart.defaults.font.family = getComputedStyle(document.documentElement).fontFamily;
  Chart.defaults.color = '#8e8a80';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.animation.duration = 350;
}
function tipStyle(){ return { backgroundColor: '#141413', padding: 10, cornerRadius: 10, titleFont: { weight: '600' }, displayColors: false }; }

/* ---------- общий интерфейс ---------- */
function toast(m){ var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function(){ t.hidden = true; }, 2600); }
function sheet(html){ $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; $('.sheet-card').scrollTop = 0; }
function closeSheet(){ $('#sheet').hidden = true; }
document.addEventListener('click', function(e){ if (e.target.closest('[data-close]')) closeSheet(); });

function renderPeriod(){
  $$('.seg button').forEach(function(b){ b.classList.toggle('on', b.dataset.mode === P.mode); });
  $('#plabel').textContent = label(P.mode, P.anchor);
  var all = P.mode === 'all';
  $('#prev').disabled = all || range(P.mode, P.anchor).s <= dataMin();
  $('#next').disabled = all || range(P.mode, P.anchor).e >= (todayS() > dataMax() ? todayS() : dataMax());
  var isToday = P.mode === 'day' && P.anchor === todayS();
  $('#today').classList.toggle('is', isToday);
  $('#periodBar').hidden = P.view === 'data';
  var al = accList(), ab = $('#accBar');
  ab.hidden = al.length < 2 || P.view === 'data';
  if (!ab.hidden) ab.innerHTML = [{ id: 'all', label: 'Все счета' }].concat(al).map(function(a){ return '<button data-acc="' + esc(a.id) + '" class="' + ((S.accSel || 'all') === a.id ? 'on' : '') + '">' + esc(a.label) + '</button>'; }).join('');
  $('#goData').classList.toggle('on', P.view === 'data');
}
var VIEWS = {};
function render(){
  renderPeriod();
  $$('.tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.view === P.view); });
  $$('.view').forEach(function(v){ v.hidden = v.id !== 'v-' + P.view; });
  if (!VT().length && P.view !== 'data'){ renderEmpty(); return; }
  (VIEWS[P.view] || renderOverview)();
}
function renderEmpty(){
  $('#v-' + P.view).innerHTML = '<div class="card welcome stack"><h1>Добавьте первую выписку</h1>' +
    '<p class="muted">Скачайте в приложении Т-Банка «Справку о движении средств» в PDF и выберите её здесь. Файл разбирается прямо на этом устройстве и никуда не отправляется.</p>' +
    '<button class="btn wide" data-go="data">Загрузить выписку</button></div>';
}
document.addEventListener('click', function(e){ var g = e.target.closest('[data-go]'); if (g){ P.view = g.dataset.go; render(); window.scrollTo(0, 0); } });

/* ---------- Обзор ---------- */
function renderOverview(){
  var r = range(P.mode, P.anchor), list = inR(r), cov = coverage(r);
  var spend = sumSpend(list);
  var prevR = P.mode === 'all' ? null : range(P.mode, shift(P.mode, P.anchor, -1));
  var prevSpend = prevR && coverage(prevR) !== 'none' ? sumSpend(inR(prevR)) : null;
  var inc = list.filter(function(t){ return t.amount > 0; }).reduce(function(s, t){ return s + t.amount; }, 0);
  var outTr = list.filter(function(t){ return isOut(t); }).reduce(function(s, t){ return s - t.amount; }, 0);
  var cash = list.filter(function(t){ return t.kind === 'cash_out'; }).reduce(function(s, t){ return s - t.amount; }, 0);
  var cats = byCat(list);
  var nm = { day: 'день', week: 'неделю', month: 'месяц', year: 'год', all: 'всё время' }[P.mode];
  var prevNm = { day: 'вчера', week: 'прошлой неделей', month: 'прошлым месяцем', year: 'прошлым годом' }[P.mode];
  var cmp = '';
  if (cov === 'none') cmp = 'За этот период в загруженных выписках нет данных.';
  else if (prevSpend !== null){
    var d = spend - prevSpend;
    cmp = (prevSpend > 0 ? '<span class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + rub0(Math.abs(d)) + ' (' + (d > 0 ? '+' : '−') + pct(Math.abs(d), prevSpend) + ')</span> по сравнению с ' + prevNm : 'В предыдущий период трат не было');
  }
  var monthShare = '';
  if (P.mode === 'day' || P.mode === 'week'){
    var mr = range('month', P.anchor), ms = sumSpend(inR(mr));
    if (ms > 0) monthShare = '<div class="cmp" style="margin-top:4px">Это ' + pct(spend, ms) + ' от трат за ' + MONTHS[parseD(P.anchor).getMonth()] + ' (' + rub0(ms) + ')</div>';
  }
  var h = '<div class="grid">';
  h += '<div class="card hero"><div class="lbl">Потрачено на покупки за ' + nm + '</div><div class="big">' + (cov === 'none' ? 'Нет данных' : rub0(spend)) + '</div><div class="cmp">' + cmp + '</div>' + monthShare +
    (cov === 'partial' ? '<div class="note">Период загружен не полностью: данные есть с ' + fmtD(dataMin()) + ' по ' + fmtD(dataMax()) + '.</div>' : '') + '</div>';
  h += '<div class="grid kpis">' +
    kpi('in', 'Поступило', rub0(inc), list.filter(function(t){ return t.amount > 0; }).length + ' зачислений') +
    kpi('tr', 'Отправлено переводами', rub0(outTr), 'людям и на счета') +
    kpi('cash', 'Снято наличными', rub0(cash), '') +
    kpi('ops', 'Покупок', String(list.filter(function(t){ return t.kind === 'purchase'; }).length), spend > 0 && list.length ? 'средний чек ' + rub0(spend / Math.max(1, list.filter(function(t){ return t.kind === 'purchase'; }).length)) : '') + '</div>';

  // Структура расходов
  h += '<div class="grid two"><div class="card"><h2>На что ушли деньги <small>нажмите на цвет</small></h2>';
  if (cats.length){
    h += '<div class="donutwrap"><div class="donut"><canvas id="cDonut"></canvas><div class="mid" id="donutMid"><b>' + rub0(spend) + '</b><span>всего покупок</span></div></div><div class="legend">' +
      cats.slice(0, 7).map(function(c){ return '<div><span class="dot" style="background:' + color(c.cat) + '"></span>' + esc(c.cat) + ' · ' + pct(c.v, spend) + '</div>'; }).join('') +
      (cats.length > 7 ? '<div class="muted">ещё ' + (cats.length - 7) + ' категорий ниже</div>' : '') + '</div></div>';
  } else h += '<p class="muted">Покупок за период нет.</p>';
  h += '</div>';

  // Динамика
  h += '<div class="card"><h2>' + trendTitle() + ' <small>нажмите на столбец</small></h2>';
  if (P.mode === 'day') h += dayOpsHtml(list);
  else h += '<div class="chartbox"><canvas id="cTrend"></canvas></div><div id="trendInfo" class="note">Нажмите на столбец, чтобы увидеть точную сумму.</div>';
  h += '</div></div>';

  // Список категорий
  if (cats.length){
    var max = cats[0].v;
    h += '<div class="card"><h2>Категории <small>от большего к меньшему</small></h2><div class="rows">' +
      cats.map(function(c){ return '<button class="row" data-cat="' + esc(c.cat) + '"><span class="dot" style="background:' + color(c.cat) + '"></span><span class="name">' + esc(c.cat) + '</span><span class="amt">' + rub0(c.v) + '</span><span class="meta"><span class="bar"><i style="width:' + Math.max(2, c.v / max * 100) + '%;background:' + color(c.cat) + '"></i></span>' + pct(c.v, spend) + '</span></button>'; }).join('') + '</div></div>';
  }
  if (P.mode === 'month') h += calendarHtml(r);
  h += '</div>';
  $('#v-overview').innerHTML = h;

  if (cats.length){
    chart('cDonut', { type: 'doughnut', data: { labels: cats.map(function(c){ return c.cat; }), datasets: [{ data: cats.map(function(c){ return Math.max(0, c.v); }), backgroundColor: cats.map(function(c){ return color(c.cat); }), borderColor: '#fff', borderWidth: 2, hoverOffset: 8 }] },
      options: { cutout: '68%', maintainAspectRatio: false, plugins: { tooltip: { enabled: false } },
        onClick: function(ev, els){ if (els.length) catSheet(cats[els[0].index].cat, list); },
        onHover: function(ev, els){ var m = $('#donutMid'); if (!m) return; if (els.length){ var c = cats[els[0].index]; m.innerHTML = '<b>' + rub0(c.v) + '</b><span>' + esc(c.cat) + ' · ' + pct(c.v, spend) + '</span>'; } else m.innerHTML = '<b>' + rub0(spend) + '</b><span>всего покупок</span>'; } } });
  }
  if (P.mode !== 'day') trendChart(r, list);
  $$('#v-overview [data-cat]').forEach(function(b){ b.onclick = function(){ catSheet(b.dataset.cat, list); }; });
  $$('#v-overview [data-day]').forEach(function(b){ b.onclick = function(){ P.mode = 'day'; P.anchor = b.dataset.day; render(); window.scrollTo(0, 0); }; });
  $$('#v-overview [data-op]').forEach(function(b){ b.onclick = function(){ opSheet(b.dataset.op); }; });
  $$('#v-overview .kpi').forEach(function(b){ b.onclick = function(){ kpiSheet(b.dataset.k, list); }; });
}
function fmtD(s){ var d = parseD(s); return d.getDate() + ' ' + MONTHS_G[d.getMonth()] + ' ' + d.getFullYear(); }
function kpi(k, l, v, s){ return '<button class="card kpi" data-k="' + k + '"><div class="lbl">' + l + '</div><div class="val">' + v + '</div><div class="sub">' + (s || '&nbsp;') + '</div></button>'; }
function trendTitle(){ return { day: 'Операции за день', week: 'По дням недели', month: 'По дням месяца', year: 'По месяцам', all: 'По месяцам' }[P.mode]; }
function buckets(r){
  var out = [];
  if (P.mode === 'year' || P.mode === 'all'){
    var d = parseD(r.s); d = new Date(d.getFullYear(), d.getMonth(), 1); var end = parseD(r.e);
    while (d <= end){ var s = ymd(d), e = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); out.push({ s: s, e: e, l: MON_S[d.getMonth()] + (P.mode === 'all' ? ' ' + String(d.getFullYear()).slice(2) : ''), full: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), mode: 'month' }); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  } else {
    var x = parseD(r.s), y = parseD(r.e);
    while (x <= y){ var k = ymd(x); out.push({ s: k, e: k, l: P.mode === 'week' ? WD[(x.getDay() + 6) % 7] : String(x.getDate()), full: fmtD(k), mode: 'day' }); x.setDate(x.getDate() + 1); }
  }
  return out;
}
function trendChart(r, list){
  var bs = buckets(r);
  bs.forEach(function(b){ b.v = sumSpend(list.filter(function(t){ return t.date >= b.s && t.date <= b.e; })); });
  var avg = bs.filter(function(b){ return b.v > 0; }), mean = avg.length ? avg.reduce(function(s, b){ return s + b.v; }, 0) / avg.length : 0;
  var sel = -1;
  var c = chart('cTrend', { type: 'bar', data: { labels: bs.map(function(b){ return b.l; }), datasets: [
      { data: bs.map(function(b){ return Math.max(0, b.v); }), backgroundColor: bs.map(function(){ return '#cfcabf'; }), hoverBackgroundColor: '#141413', borderRadius: 6, borderSkipped: false, maxBarThickness: 28 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0, font: { size: 11 } } }, y: { grid: { color: '#efece5' }, border: { display: false }, ticks: { font: { size: 11 }, callback: function(v){ return v >= 1000 ? Math.round(v / 1000) + 'k' : v; } } } },
      plugins: { tooltip: Object.assign(tipStyle(), { callbacks: { title: function(i){ return bs[i[0].dataIndex].full; }, label: function(i){ return rub0(i.raw); } } }) },
      onClick: function(ev, els){
        if (!els.length) return; var i = els[0].index, b = bs[i];
        c.data.datasets[0].backgroundColor = bs.map(function(_, j){ return j === i ? '#141413' : '#cfcabf'; }); c.update('none');
        var cs = byCat(list.filter(function(t){ return t.date >= b.s && t.date <= b.e; })).slice(0, 3);
        $('#trendInfo').innerHTML = '<b>' + esc(b.full) + ': ' + rub0(b.v) + '</b>' + (mean ? ' · ' + (b.v > mean ? 'выше' : 'ниже') + ' среднего (' + rub0(mean) + ')' : '') +
          (cs.length ? '<br>' + cs.map(function(x){ return '<span class="dot" style="background:' + color(x.cat) + '"></span> ' + esc(x.cat) + ' ' + rub0(x.v); }).join(' &nbsp; ') : '') +
          '<br><button class="btn ghost" style="margin-top:8px;padding:7px 12px;font-size:14px" data-open="' + b.mode + '|' + b.s + '">Открыть ' + (b.mode === 'day' ? 'этот день' : 'этот месяц') + ' →</button>';
        $('#trendInfo [data-open]').onclick = function(){ var p = this.dataset.open.split('|'); P.mode = p[0]; P.anchor = p[1]; render(); window.scrollTo(0, 0); };
      } } });
}
function dayOpsHtml(list){
  var ops = list.slice().sort(function(a, b){ return b.time.localeCompare(a.time); });
  if (!ops.length) return '<p class="muted">Операций за этот день нет.</p>';
  return '<div class="rows">' + ops.map(opRow).join('') + '</div>';
}
function opRow(t){
  return '<button class="row" data-op="' + esc(t.id) + '"><span class="dot" style="background:' + color(t.cat) + '"></span><span class="name">' + esc(t.cp && !SPEND[t.kind] ? (S.names[t.cp] || t.cp) : t.merchant) + '</span><span class="amt ' + (t.amount > 0 ? 'pos' : '') + '">' + rub(t.amount, true) + '</span><span class="meta">' + t.time + ' · ' + esc(t.cat) + '</span></button>';
}
function calendarHtml(r){
  var s = parseD(r.s), e = parseD(r.e), days = [], max = 0;
  for (var d = new Date(s); d <= e; d.setDate(d.getDate() + 1)){ var k = ymd(d), v = sumSpend(inR({ s: k, e: k })); days.push({ k: k, v: v, n: d.getDate() }); if (v > max) max = v; }
  var lead = (s.getDay() + 6) % 7, h = '<div class="card"><h2>Календарь трат <small>чем темнее, тем больше</small></h2><div class="cal">' + WD.map(function(w){ return '<div class="h">' + w + '</div>'; }).join('');
  for (var i = 0; i < lead; i++) h += '<span></span>';
  var mn = dataMin(), mx = dataMax(), td = todayS();
  days.forEach(function(x){
    var out = x.k < mn || x.k > mx, a = max ? x.v / max : 0;
    var bg = out ? 'transparent' : x.v > 0 ? 'rgba(20,20,19,' + (0.08 + a * 0.82).toFixed(2) + ')' : '#efece5';
    h += '<button data-day="' + x.k + '" class="' + (out ? 'empty ' : '') + (x.k === td ? 'today' : '') + '" style="background:' + bg + ';color:' + (a > 0.5 ? '#fff' : 'inherit') + '" aria-label="' + fmtD(x.k) + ': ' + rub0(x.v) + '">' + x.n + '</button>';
  });
  return h + '</div><div class="note">Нажмите на день — откроется дашборд этого дня.</div></div>';
}
function catSheet(cat, list){
  var ops = list.filter(function(t){ return t.cat === cat && t.spend; }), tot = sumSpend(ops), all = sumSpend(list);
  var m = {}; ops.forEach(function(t){ m[t.merchant] = m[t.merchant] || { v: 0, n: 0 }; m[t.merchant].v += t.spend; m[t.merchant].n++; });
  var ms = Object.keys(m).map(function(k){ return { k: k, v: m[k].v, n: m[k].n }; }).sort(function(a, b){ return b.v - a.v; });
  sheet('<h3><span class="dot" style="background:' + color(cat) + '"></span> ' + esc(cat) + '</h3><p class="muted">' + label(P.mode, P.anchor) + '</p>' +
    '<div class="grid kpis" style="margin:10px 0"><div class="card"><div class="muted">Сумма</div><b style="font-size:20px">' + rub0(tot) + '</b></div><div class="card"><div class="muted">Доля покупок</div><b style="font-size:20px">' + pct(tot, all) + '</b></div><div class="card"><div class="muted">Операций</div><b style="font-size:20px">' + ops.length + '</b></div><div class="card"><div class="muted">Средний чек</div><b style="font-size:20px">' + rub0(tot / Math.max(1, ops.length)) + '</b></div></div>' +
    '<h2 style="font-size:15px;margin:14px 0 4px">Где тратили</h2><div class="rows">' + ms.slice(0, 15).map(function(x){ return '<div class="row"><span></span><span class="name">' + esc(x.k) + '</span><span class="amt">' + rub0(x.v) + '</span><span class="meta">' + x.n + ' раз · ' + pct(x.v, tot) + '</span></div>'; }).join('') + '</div>' +
    '<h2 style="font-size:15px;margin:14px 0 4px">Последние операции</h2><div class="rows" id="catOps">' + ops.slice().sort(function(a, b){ return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 30).map(function(t){ return opRow(t).replace('<span class="meta">', '<span class="meta">' + fmtD(t.date) + ', '); }).join('') + '</div>');
  $$('#catOps [data-op]').forEach(function(b){ b.onclick = function(){ opSheet(b.dataset.op); }; });
}
function kpiSheet(k, list){
  if (k === 'ops'){ P.view = 'ops'; render(); return; }
  if (k === 'in' || k === 'tr'){ P.view = 'transfers'; render(); return; }
  var ops = list.filter(function(t){ return t.kind === 'cash_out'; });
  sheet('<h3>Снятие наличных</h3><p class="muted">' + label(P.mode, P.anchor) + '. Куда потрачены наличные, в выписке не видно.</p><div class="rows">' + (ops.map(function(t){ return opRow(t).replace('<span class="meta">', '<span class="meta">' + fmtD(t.date) + ', '); }).join('') || '<p class="muted">Не было.</p>') + '</div>');
}

/* ---------- Переводы ---------- */
var IN_KIND = { transfer_in: 'Переводы и пополнения', self: 'Переводы себе', cash_in: 'Внесение наличных', income: 'Выплаты и продажи', refund: 'Возвраты и отмены', cashback: 'Кэшбэк' };
var IN_COL = { transfer_in: '#3d3d3a', self: '#8e8a80', cash_in: '#b59a3c', income: '#3d7a55', refund: '#6e8fb5', cashback: '#9b6fb0' };
function renderTransfers(){
  var r = range(P.mode, P.anchor), list = inR(r);
  var ins = list.filter(function(t){ return t.amount > 0; }), outs = list.filter(function(t){ return isOut(t); });
  var inSum = ins.reduce(function(s, t){ return s + t.amount; }, 0), outSum = outs.reduce(function(s, t){ return s - t.amount; }, 0);
  var kinds = Object.keys(IN_KIND).map(function(k){ return { k: k, v: ins.filter(function(t){ return t.kind === k; }).reduce(function(s, t){ return s + t.amount; }, 0) }; }).filter(function(x){ return x.v > 0; }).sort(function(a, b){ return b.v - a.v; });
  var cp = {};
  list.forEach(function(t){ if (t.kind === 'transfer_in' || t.kind === 'transfer_out' || t.kind === 'self' || t.kind === 'income'){ var c = cp[t.cp] = cp[t.cp] || { in: 0, out: 0, n: 0, last: '' }; if (t.amount > 0) c.in += t.amount; else c.out -= t.amount; c.n++; if (t.date > c.last) c.last = t.date; } });
  var cps = Object.keys(cp).map(function(k){ return Object.assign({ k: k }, cp[k]); }).sort(function(a, b){ return (b.in + b.out) - (a.in + a.out); });
  var h = '<div class="grid"><div class="grid kpis">' +
    '<div class="card"><div class="muted">Поступило всего</div><b style="font-size:20px" class="pos">' + rub0(inSum) + '</b><div class="muted">' + ins.length + ' зачислений</div></div>' +
    '<div class="card"><div class="muted">Отправлено переводами</div><b style="font-size:20px">' + rub0(outSum) + '</b><div class="muted">' + outs.length + ' переводов</div></div></div>';
  h += '<div class="card"><h2>Поступления и переводы <small>нажмите на столбец</small></h2>' + (P.mode === 'day' ? '' : '<div class="chartbox"><canvas id="cFlow"></canvas></div>') + '<div class="chips" style="margin-top:8px"><span class="chip"><span class="dot" style="background:#3d7a55"></span>Поступления</span><span class="chip"><span class="dot" style="background:#c9c3b6"></span>Отправленные переводы</span></div><div id="flowInfo" class="note" ' + (P.mode === 'day' ? 'hidden' : '') + '>Нажмите на столбец, чтобы увидеть суммы.</div></div>';
  if (kinds.length) h += '<div class="card"><h2>Откуда пришли деньги</h2><div class="rows">' + kinds.map(function(x){ return '<div class="row"><span class="dot" style="background:' + IN_COL[x.k] + '"></span><span class="name">' + IN_KIND[x.k] + '</span><span class="amt">' + rub0(x.v) + '</span><span class="meta"><span class="bar"><i style="width:' + Math.max(2, x.v / kinds[0].v * 100) + '%;background:' + IN_COL[x.k] + '"></i></span>' + pct(x.v, inSum) + '</span></div>'; }).join('') + '</div><div class="note">Поступления — это не обязательно доход: сюда входят переводы себе, наличные и возвраты.</div></div>';
  h += '<div class="card"><h2>Кто присылает и кому отправляете <small>нажмите, чтобы подписать</small></h2>';
  h += cps.length ? '<div class="rows">' + cps.map(function(c){ return '<button class="row" data-cp="' + esc(c.k) + '"><span></span><span class="name">' + esc(S.names[c.k] || c.k) + '</span><span class="amt">' + (c.in ? '<span class="pos">+' + rub0(c.in) + '</span>' : '') + (c.in && c.out ? '<br>' : '') + (c.out ? '−' + rub0(c.out) : '') + '</span><span class="meta">' + c.n + ' операций · последняя ' + fmtD(c.last) + (S.names[c.k] ? ' · ' + esc(c.k) : '') + '</span></button>'; }).join('') + '</div>' : '<p class="muted">Переводов за период нет.</p>';
  h += '<div class="note">В выписке Т-Банка нет имён отправителей и получателей — только телефон, номер договора или карты. Нажмите на строку и подпишите, кто это, например «Мама». Подпись сохранится на телефоне.</div></div></div>';
  $('#v-transfers').innerHTML = h;
  if (P.mode !== 'day'){
    var bs = buckets(r);
    bs.forEach(function(b){ var l = list.filter(function(t){ return t.date >= b.s && t.date <= b.e; }); b.i = l.filter(function(t){ return t.amount > 0; }).reduce(function(s, t){ return s + t.amount; }, 0); b.o = l.filter(function(t){ return isOut(t); }).reduce(function(s, t){ return s - t.amount; }, 0); });
    chart('cFlow', { type: 'bar', data: { labels: bs.map(function(b){ return b.l; }), datasets: [{ label: 'Поступления', data: bs.map(function(b){ return b.i; }), backgroundColor: '#3d7a55', borderRadius: 5, maxBarThickness: 18 }, { label: 'Переводы', data: bs.map(function(b){ return b.o; }), backgroundColor: '#c9c3b6', borderRadius: 5, maxBarThickness: 18 }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, font: { size: 11 } } }, y: { grid: { color: '#efece5' }, border: { display: false }, ticks: { font: { size: 11 }, callback: function(v){ return v >= 1000 ? Math.round(v / 1000) + 'k' : v; } } } },
        plugins: { tooltip: Object.assign(tipStyle(), { displayColors: true, callbacks: { title: function(i){ return bs[i[0].dataIndex].full; }, label: function(i){ return i.dataset.label + ': ' + rub0(i.raw); } } }) },
        onClick: function(ev, els){ if (!els.length) return; var b = bs[els[0].index]; $('#flowInfo').innerHTML = '<b>' + esc(b.full) + '</b><br><span class="pos">Поступило ' + rub0(b.i) + '</span> · отправлено ' + rub0(b.o) + ' · разница ' + rub(b.i - b.o, true); } } });
  }
  $$('#v-transfers [data-cp]').forEach(function(b){ b.onclick = function(){ cpSheet(b.dataset.cp, list); }; });
}
function cpSheet(k, list){
  var ops = list.filter(function(t){ return t.cp === k && (t.kind === 'transfer_in' || t.kind === 'transfer_out' || t.kind === 'self' || t.kind === 'income'); }).sort(function(a, b){ return (b.date + b.time).localeCompare(a.date + a.time); });
  sheet('<h3>' + esc(S.names[k] || k) + '</h3><p class="muted">' + esc(k) + ' · ' + label(P.mode, P.anchor) + '</p>' +
    '<div class="stack" style="margin:12px 0"><label class="muted" for="cpName">Подпись (только на этом телефоне)</label><input id="cpName" type="text" maxlength="40" placeholder="Например: Мама, Аренда, Дима" value="' + esc(S.names[k] || '') + '"><button class="btn" id="cpSave">Сохранить подпись</button></div>' +
    '<div class="rows">' + ops.map(function(t){ return opRow(t).replace('<span class="meta">', '<span class="meta">' + fmtD(t.date) + ', '); }).join('') + '</div>');
  $('#cpSave').onclick = function(){ var v = $('#cpName').value.trim(); if (v) S.names[k] = v; else delete S.names[k]; save(); closeSheet(); render(); toast('Подпись сохранена'); };
}

/* ---------- Операции ---------- */
function renderOps(){
  var r = range(P.mode, P.anchor), list = inR(r);
  var cats = byCat(list).map(function(c){ return c.cat; });
  var q = P.q.toLowerCase();
  var f = list.filter(function(t){ return (!P.cat || t.cat === P.cat) && (!q || (t.desc + ' ' + t.cat + ' ' + (S.names[t.cp] || '')).toLowerCase().indexOf(q) >= 0); }).sort(function(a, b){ return (b.date + b.time).localeCompare(a.date + a.time); });
  var h = '<div class="stack"><input type="search" id="q" placeholder="Поиск: магазин, сумма, категория" value="' + esc(P.q) + '">' +
    '<div class="chips"><button class="chip ' + (!P.cat ? 'on' : '') + '" data-fc="">Все</button>' + cats.map(function(c){ return '<button class="chip ' + (P.cat === c ? 'on' : '') + '" data-fc="' + esc(c) + '"><span class="dot" style="background:' + color(c) + '"></span>' + esc(c) + '</button>'; }).join('') + '</div>' +
    '<div class="muted">' + f.length + ' операций · покупки ' + rub0(sumSpend(f)) + '. Нажмите на операцию, чтобы поменять категорию.</div>';
  var shown = f.slice(0, 400), day = '';
  h += '<div class="card" style="padding-top:4px">';
  if (!shown.length) h += '<p class="muted">Ничего не найдено.</p>';
  shown.forEach(function(t){
    if (t.date !== day){ day = t.date; var ds = sumSpend(f.filter(function(x){ return x.date === day; })); h += '<div class="day-h"><span>' + fmtD(day) + '</span><span>' + (ds ? rub0(ds) : '') + '</span></div>'; }
    h += opRow(t);
  });
  if (f.length > shown.length) h += '<p class="muted">Показаны первые 400. Уточните поиск или выберите период короче.</p>';
  h += '</div></div>';
  $('#v-ops').innerHTML = h;
  var qi = $('#q'); qi.oninput = function(){ P.q = qi.value; clearTimeout(renderOps.t); renderOps.t = setTimeout(function(){ renderOps(); var n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $$('#v-ops [data-fc]').forEach(function(b){ b.onclick = function(){ P.cat = b.dataset.fc || null; renderOps(); }; });
  $$('#v-ops [data-op]').forEach(function(b){ b.onclick = function(){ opSheet(b.dataset.op); }; });
}
function opSheet(id){
  var t = S.tx.filter(function(x){ return x.id === id; })[0]; if (!t) return;
  var opts = catNames().concat(['Наличные', 'Переводы']);
  var same = S.tx.filter(function(x){ return x.merchant === t.merchant && x.spend; }).length;
  sheet('<h3>' + esc(t.merchant) + '</h3><p class="muted">' + fmtD(t.date) + ', ' + t.time + ' · карта ' + esc(t.card) + '</p>' +
    '<div style="font-size:30px;font-weight:700;margin:8px 0" class="' + (t.amount > 0 ? 'pos' : '') + '">' + rub(t.amount, true) + '</div>' +
    '<div class="note" style="margin-bottom:12px">Текст в выписке: ' + esc(t.desc) + '</div>' +
    (t.spend ? '<div class="stack"><label class="muted" for="opCat">Категория</label><select id="opCat">' + opts.map(function(o){ return '<option' + (o === t.cat ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      (same > 1 ? '<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="opAll" checked> Применить ко всем операциям «' + esc(t.merchant) + '» (' + same + ')</label>' : '') +
      '<button class="btn" id="opSave">Сохранить категорию</button></div>' : '<p class="muted">Тип: ' + ({ transfer_in: 'входящий перевод', transfer_out: 'исходящий перевод', self: 'перевод себе', cash_in: 'внесение наличных', cash_out: 'снятие наличных', income: 'выплата', cashback: 'кэшбэк', savings: 'копилка' }[t.kind] || t.kind) + '</p>'));
  var b = $('#opSave'); if (b) b.onclick = function(){
    var c = $('#opCat').value, all = $('#opAll') && $('#opAll').checked;
    if (all){ S.rules[t.merchant] = c; S.tx.forEach(function(x){ if (x.merchant === t.merchant) delete S.overrides[x.id]; }); } else S.overrides[t.id] = c;
    S.tx.forEach(enrich); save(); closeSheet(); render(); toast('Категория сохранена');
  };
}

/* ---------- Выписки и данные ---------- */
var pending = null;
function renderData(){
  var h = '<div class="grid"><div class="card stack"><h2>Загрузить выписку</h2>' +
    '<label class="drop"><input type="file" id="file" accept="application/pdf,.pdf"><b>Выбрать PDF-выписку</b><span class="muted">Т-Банк → «Справка о движении средств» или Альфа-Банк → «Выписка по счёту». Файл обрабатывается только на этом устройстве.</span></label>' +
    '<div id="imp"></div></div>';
  h += '<div class="card"><h2>Загружено</h2>' + (S.tx.length ? '<p>' + S.tx.length.toLocaleString('ru-RU') + ' операций, с ' + fmtD(dataMin()) + ' по ' + fmtD(dataMax()) + '.</p>' : '<p class="muted">Пока ничего.</p>') +
    (S.imports.length ? '<div class="rows">' + S.imports.slice().reverse().map(function(i){ return '<div class="row"><span></span><span class="name">' + esc(i.name) + '</span><span class="amt">+' + i.added + '</span><span class="meta">' + esc(i.period || '') + ' · добавлено ' + new Date(i.at).toLocaleDateString('ru-RU') + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
  var al = accList();
  if (al.length > 1 || (al.length && al[0].id !== 'tbank')) h += '<div class="card"><h2>Счета</h2><div class="rows">' + al.map(function(a){ return '<div class="row"><span></span><span class="name">' + esc(a.label) + '</span><span class="amt"><button class="btn ghost sm" data-delacc="' + esc(a.id) + '">Удалить</button></span><span class="meta">' + a.n.toLocaleString('ru-RU') + ' операций</span></div>'; }).join('') + '</div><div class="note">Счета не смешиваются: сверху на экранах можно выбрать «Все счета» или нужный.</div></div>';
  h += '<div class="card stack"><h2>Резервная копия</h2><p class="muted" style="margin:0">Данные хранятся только на этом устройстве. Сохраните копию в «Файлы» — с ней можно восстановить всё на другом телефоне или компьютере.</p>' +
    '<input type="password" id="bpw" placeholder="Пароль для копии (по желанию)" autocomplete="new-password">' +
    '<button class="btn" id="bExp"' + (S.tx.length ? '' : ' disabled') + '>Сохранить резервную копию</button>' +
    '<label class="btn ghost" style="cursor:pointer">Восстановить из копии<input type="file" id="bImp" accept=".json,application/json" hidden></label></div>';
  h += '<div class="card"><h2>Как добавить на экран «Домой»</h2><ol class="steps"><li>Откройте этот сайт в Safari.</li><li>Нажмите кнопку «Поделиться» (квадрат со стрелкой вверх) внизу экрана.</li><li>Выберите «На экран «Домой»» и нажмите «Добавить».</li></ol><p class="muted">После этого «Мой расчёт» открывается значком, как приложение, и работает без интернета.</p><p class="muted" id="persist"></p></div>';
  h += '<div class="card stack"><h2>Удалить данные</h2><p class="muted" style="margin:0">Сотрёт все операции, категории и подписи с этого устройства.</p><button class="btn danger" id="wipe"' + (S.tx.length ? '' : ' disabled') + '>Удалить всё</button></div></div>';
  $('#v-data').innerHTML = h;
  $('#file').onchange = function(){ if (this.files[0]) importPdf(this.files[0]); this.value = ''; };
  $('#bExp').onclick = exportBackup;
  $('#bImp').onchange = function(){ if (this.files[0]) importBackup(this.files[0]); this.value = ''; };
  $$('[data-delacc]').forEach(function(b){ b.onclick = function(){ var id = b.dataset.delacc;
    sheet('<h3>Удалить счёт «' + esc(accLabel(id)) + '»?</h3><p class="muted">Удалятся только операции этого счёта. Остальные останутся.</p><div class="stack"><button class="btn danger" id="delAccY">Да, удалить</button><button class="btn ghost" data-close>Отмена</button></div>');
    $('#delAccY').onclick = function(){ var n = S.tx.length; S.tx = S.tx.filter(function(t){ return accOf(t) !== id; }); S.imports = S.imports.filter(function(i){ return (i.acc || 'tbank') !== id; }); if (S.accSel === id) S.accSel = 'all'; save(); closeSheet(); render(); toast('Удалено ' + (n - S.tx.length) + ' операций'); };
  }; });
  $('#wipe').onclick = function(){
    sheet('<h3>Удалить все данные?</h3><p class="muted">Операции, категории и подписи будут удалены с этого устройства. Отменить нельзя.</p><div class="stack"><button class="btn danger" id="wipeY">Да, удалить</button><button class="btn ghost" data-close>Отмена</button></div>');
    $('#wipeY').onclick = function(){ S = { tx: [], rules: {}, overrides: {}, names: {}, imports: [], limits: {}, goals: [], customCats: [], catColors: {}, accounts: {}, accSel: 'all' }; save(); closeSheet(); render(); toast('Данные удалены'); };
  };
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function(p){ var e = $('#persist'); if (e) e.textContent = p ? 'Хранилище защищено от автоматической очистки.' : 'Совет: добавьте приложение на экран «Домой» — так данные надёжнее сохраняются.'; });
}
function importPdf(file){
  var box = $('#imp');
  box.innerHTML = '<p class="muted">Читаю выписку… Большой файл может обрабатываться до минуты.</p>';
  if (!window.pdfjsLib){ box.innerHTML = '<p class="bad">Модуль чтения PDF не загрузился. Обновите страницу.</p>'; return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  file.arrayBuffer().then(function(buf){ return TbankParser.parseAnyPdf(pdfjsLib, new Uint8Array(buf)); }).then(function(res){
    var add = mergeTx(res.tx);
    var dup = res.tx.length - add.length;
    var ai = add.filter(function(t){ return t.amount > 0; }).reduce(function(s, t){ return s + t.amount; }, 0), ao = add.filter(function(t){ return t.amount < 0; }).reduce(function(s, t){ return s - t.amount; }, 0);
    pending = { add: add, name: file.name, period: res.period ? res.period.join(' – ') : '', acc: res.acc };
    box.innerHTML = '<div class="note" style="background:#fff;border:1px solid var(--line)">' +
      '<b>' + esc(file.name) + '</b><br>Счёт: ' + esc(res.acc ? res.acc.label : 'Т-Банк') + '<br>Период: ' + esc(pending.period || 'не указан') + '<br>Операций в файле: ' + res.tx.length +
      '<br>Сверка с итогами банка: ' + (res.ok ? '<span class="ok">совпадает ✓</span> (поступления ' + rub(res.totals.in) + ', расходы ' + rub(res.totals.out) + ')' : res.totals.in != null ? '<span class="bad">не совпадает</span> — банк: +' + rub(res.totals.in) + ' / −' + rub(res.totals.out) + ', прочитано: +' + rub(res.parsed.in) + ' / −' + rub(res.parsed.out) : '<span class="bad">итогов в файле не найдено</span>') +
      '<br><b>Новых операций: ' + add.length + '</b>' + (dup ? ' · уже были загружены: ' + dup + ' (повторно не добавляются)' : '') +
      (add.length ? '<br>Новые: +' + rub0(ai) + ' поступлений, −' + rub0(ao) + ' списаний' : '') + '</div>' +
      (add.length ? '<button class="btn wide" id="impGo" style="margin-top:10px">Добавить ' + add.length + ' операций</button>' : '<p class="muted">Всё из этого файла уже есть в приложении.</p>');
    var g = $('#impGo'); if (g) g.onclick = commitImport;
  }).catch(function(e){ box.innerHTML = '<p class="bad">Не удалось прочитать файл: ' + esc(e.message || e) + '</p><p class="muted">Подходят PDF-выписки Т-Банка («Справка о движении средств») и Альфа-Банка («Выписка по счёту»).</p>'; });
}
function commitImport(){
  if (!pending) return;
  pending.add.forEach(enrich);
  S.tx = S.tx.concat(pending.add);
  if (pending.acc){ S.accounts = S.accounts || {}; S.accounts[pending.acc.id] = pending.acc.label; }
  S.imports.push({ name: pending.name, period: pending.period, added: pending.add.length, at: Date.now(), acc: pending.acc ? pending.acc.id : 'tbank' });
  var hadOther = pending.acc && S.tx.some(function(t){ return accOf(t) !== pending.acc.id; });
  var n = pending.add.length, pending0acc = pending.acc ? pending.acc.id : 'all'; pending = null;
  save().then(function(){
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    if (hadOther) S.accSel = pending0acc; P.anchor = dataMax(); P.mode = 'month'; P.view = 'overview'; render(); window.scrollTo(0, 0);
    toast('Добавлено ' + n + ' операций. Не забудьте сохранить резервную копию.');
  });
}
/* резервная копия: JSON, при пароле — AES-GCM */
function b64(buf){ var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); }
function unb64(s){ var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function keyFrom(pw, salt){ var enc = new TextEncoder(); return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function(k){ return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 250000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }); }
function slim(){ return { v: 1, tx: S.tx.map(function(t){ var o = { id: t.id, date: t.date, time: t.time, amount: t.amount, desc: t.desc, card: t.card }; if (t.acc) o.acc = t.acc; return o; }), accounts: S.accounts, rules: S.rules, overrides: S.overrides, names: S.names, imports: S.imports, limits: S.limits, goals: S.goals, customCats: S.customCats, catColors: S.catColors }; }
function exportBackup(){
  var pw = $('#bpw').value, json = JSON.stringify(slim());
  var done = function(text){
    var name = 'moy-raschet-' + todayS() + '.json', blob = new Blob([text], { type: 'application/json' });
    var file = window.File ? new File([blob], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Мой расчёт — копия' }).catch(function(){}); }
    else { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    toast(pw ? 'Зашифрованная копия готова' : 'Копия готова');
  };
  if (!pw) return done(json);
  if (pw.length < 6) return toast('Пароль — минимум 6 символов');
  var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  keyFrom(pw, salt).then(function(k){ return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(json)); })
    .then(function(ct){ done(JSON.stringify({ enc: 'aes-gcm', salt: b64(salt), iv: b64(iv), data: b64(ct) })); }).catch(function(e){ toast('Ошибка шифрования: ' + e.message); });
}
function importBackup(file){
  file.text().then(function(text){
    var o = JSON.parse(text);
    if (o.enc){
      var pw = $('#bpw').value; if (!pw) throw new Error('Копия зашифрована — введите её пароль в поле выше и выберите файл снова.');
      return keyFrom(pw, unb64(o.salt)).then(function(k){ return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.data)); })
        .then(function(pt){ return JSON.parse(new TextDecoder().decode(pt)); }, function(){ throw new Error('Неверный пароль копии.'); });
    }
    return o;
  }).then(function(o){
    if (!o || !Array.isArray(o.tx)) throw new Error('Это не резервная копия «Моего расчёта».');
    var add = mergeTx(o.tx.map(function(t){ var x = { date: t.date, time: t.time, amount: t.amount, desc: t.desc, card: t.card }; if (t.acc) x.acc = t.acc; return x; }));
    add.forEach(enrich); S.tx = S.tx.concat(add);
    Object.assign(S.rules, o.rules || {}); Object.assign(S.overrides, o.overrides || {}); Object.assign(S.names, o.names || {});
    S.imports = S.imports.concat(o.imports || []);
    Object.assign(S.limits, o.limits || {}); S.accounts = Object.assign(S.accounts || {}, o.accounts || {}); Object.assign(S.catColors, o.catColors || {});
    (o.goals || []).forEach(function(g){ if (!S.goals.some(function(x){ return x.id === g.id; })) S.goals.push(g); });
    (o.customCats || []).forEach(function(g){ if (!S.customCats.some(function(x){ return x.name === g.name; })) S.customCats.push(g); });
    S.tx.forEach(enrich);
    return save().then(function(){ render(); toast('Восстановлено: добавлено ' + add.length + ' операций'); });
  }).catch(function(e){ toast(e.message || String(e)); });
}

VIEWS.overview = renderOverview; VIEWS.transfers = renderTransfers; VIEWS.ops = renderOps; VIEWS.data = renderData;
/* ---------- события ---------- */
$$('.seg button').forEach(function(b){ b.onclick = function(){ P.mode = b.dataset.mode; render(); }; });
$('#accBar').onclick = function(e){ var b = e.target.closest('[data-acc]'); if (!b) return; S.accSel = b.dataset.acc; save(); var mx = dataMax(); if (P.anchor > mx) P.anchor = mx; render(); };
$('#prev').onclick = function(){ P.anchor = shift(P.mode, P.anchor, -1); render(); };
$('#next').onclick = function(){ P.anchor = shift(P.mode, P.anchor, 1); render(); };
$('#today').onclick = function(){ P.mode = 'day'; P.anchor = todayS(); if (P.view === 'data') P.view = 'overview'; render(); };
$$('.tabs button').forEach(function(b){ b.onclick = function(){ P.view = b.dataset.view; render(); window.scrollTo(0, 0); }; });
var sx = null;
function hScrollable(el){ for (; el && el !== document.body; el = el.parentElement){ if (el.scrollWidth > el.clientWidth + 2){ var o = getComputedStyle(el).overflowX; if (o === 'auto' || o === 'scroll') return true; } } return false; }
document.addEventListener('touchstart', function(e){ sx = (e.target.closest('canvas,.sheet,.chips,.carousel,.heat,.toggle,input,textarea,select') || hScrollable(e.target)) ? null : [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
document.addEventListener('touchend', function(e){ if (!sx || P.mode === 'all' || P.view === 'data' || !$('#sheet').hidden) return; var dx = e.changedTouches[0].clientX - sx[0], dy = e.changedTouches[0].clientY - sx[1]; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2){ var btn = dx < 0 ? $('#next') : $('#prev'); if (!btn.disabled) btn.click(); } }, { passive: true });

/* ---------- запуск ---------- */
openDB().then(function(){ return dbGet('state'); }).then(function(st){
  if (st && st.tx){ S = st; S.rules = S.rules || {}; S.overrides = S.overrides || {}; S.names = S.names || {}; S.imports = S.imports || []; }
  ['limits','catColors','accounts'].forEach(function(k){ S[k] = S[k] || {}; }); ['goals','customCats'].forEach(function(k){ S[k] = S[k] || []; });
  Object.keys(DEFAULT_OVERRIDES).forEach(function(k){ if (!S.overrides[k]) S.overrides[k] = DEFAULT_OVERRIDES[k]; });
  S.tx.forEach(enrich);
  P.anchor = S.tx.length ? (todayS() <= dataMax() ? todayS() : dataMax()) : todayS();
  if (!S.tx.length) P.view = 'data';
  $('#boot').hidden = true; $('#app').hidden = false;
  if (!DB) toast('Хранилище браузера недоступно — данные не сохранятся после закрытия.');
  render();
}).catch(function(e){ $('#bootmsg').textContent = 'Ошибка запуска: ' + e.message; });
window.MR = { S: function(){ return S; }, VT: VT, accOf: accOf, accLabel: accLabel, accList: accList, P: P, VIEWS: VIEWS, render: render, save: save, sheet: sheet, closeSheet: closeSheet, toast: toast, chart: chart, tipStyle: tipStyle, range: range, shift: shift, label: label, inR: inR, sumSpend: sumSpend, byCat: byCat, color: color, catNames: catNames, fmtD: fmtD, parseD: parseD, ymd: ymd, todayS: todayS, dataMin: dataMin, dataMax: dataMax, coverage: coverage, rub: rub, rub0: rub0, pct: pct, esc: esc, $: $, $$: $$, opRow: opRow, opSheet: opSheet, enrich: enrich, MONTHS: MONTHS, MONTHS_G: MONTHS_G, MON_S: MON_S, WD: WD };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function(){});
})();
