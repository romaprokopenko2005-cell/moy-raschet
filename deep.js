// Поиск по всей истории и глубокий анализ. Работает на устройстве.
(function(){
'use strict';
var M = window.MR; if (!M) return;
var $ = M.$, $$ = M.$$, esc = M.esc, rub0 = M.rub0, P = M.P;
var S = function(){ return M.S(); };
P.amode = P.amode || 'deep';

function plur(n, a, b, c){ var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
function times(x, per){ var r = Math.round(x * 10) / 10; return r.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' ' + (r % 1 ? 'раза' : plur(r, 'раз', 'раза', 'раз')) + ' ' + per; }
function nf(n){ return Math.round(n).toLocaleString('ru-RU'); }
function pc(a, b){ return b ? Math.round(a / b * 100) : 0; }
function sgn(p){ return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p) + '%'; }
function mk(d){ return d.slice(0, 7); }
function monName(k){ var p = k.split('-'); return M.MON_S[+p[1] - 1] + ' ' + p[0].slice(2); }
function monFull(k){ var p = k.split('-'); return M.MONTHS[+p[1] - 1] + ' ' + p[0]; }
function nameOf(t){ var s = S(); return t.spend || t.kind === 'refund' ? t.merchant : (s.names[t.cp] || t.cp || t.merchant); }
function daysBetween(a, b){ return Math.round((M.parseD(b) - M.parseD(a)) / 864e5) + 1; }

/* ---------- месяцы истории ---------- */
function monthsOf(X){
  if (!X.length) return { all: [], full: [] };
  var a = M.dataMin(), b = M.dataMax(), out = [], full = [];
  var d = M.parseD(a.slice(0, 7) + '-01');
  while (M.ymd(d) <= b){
    var k = M.ymd(d).slice(0, 7), last = M.ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    out.push(k); if (M.ymd(d) >= a && last <= b) full.push(k);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return { all: out, full: full };
}

/* ---------- транслит для поиска: «винлаб» найдёт WINELAB, «самокат» — SAMOKAT ---------- */
var TR = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
function lat(s){ return s.replace(/[а-яё]/g, function(c){ return TR[c]; }); }
function skel(s){ return lat(s.toLowerCase()).replace(/w/g, 'v').replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1').replace(/[aeiouy]/g, ''); }

/* ---------- разбор запроса ---------- */
function num(s){ return parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); }
function parseQ(q){
  var r = { text: [], min: null, max: null, exact: [] };
  q = q.toLowerCase().replace(/ё/g, 'е').replace(/₽|руб\.?|р\.(?=\s|$)/g, ' ')
    .replace(/(\d)\s+(?=\d{3}(\D|$))/g, '$1')
    .replace(/(?:от|больше|дороже)\s+(\d+(?:[.,]\d+)?)\s*(?:к|тыс)?/g, function(m, n){ return ' >' + n + (/к|тыс/.test(m) ? 'k' : '') + ' '; })
    .replace(/(?:до|меньше|дешевле)\s+(\d+(?:[.,]\d+)?)\s*(?:к|тыс)?/g, function(m, n){ return ' <' + n + (/к|тыс/.test(m) ? 'k' : '') + ' '; });
  q.split(/\s+/).filter(Boolean).forEach(function(w){
    var m, k = function(x, kk){ return num(x) * (kk ? 1000 : 1); };
    if ((m = w.match(/^(\d+(?:[.,]\d+)?)(k|к)?[-–—](\d+(?:[.,]\d+)?)(k|к)?$/))){ r.min = k(m[1], m[2] || m[4]); r.max = k(m[3], m[4]); }
    else if ((m = w.match(/^([<>])=?(\d+(?:[.,]\d+)?)(k|к|тыс)?$/))){ if (m[1] === '>') r.min = k(m[2], m[3]); else r.max = k(m[2], m[3]); }
    else if ((m = w.match(/^(\d+(?:[.,]\d+)?)(k|к)?$/))){ r.exact.push(k(m[1], m[2])); }
    else r.text.push(w);
  });
  return r;
}
var HC = new WeakMap();
function hay(t){
  var c = HC.get(t); if (c) return c;
  var s = S(), raw = (t.merchant + ' ' + t.desc + ' ' + (t.cp || '') + ' ' + (s.names[t.cp] || '') + ' ' + t.cat).toLowerCase().replace(/ё/g, 'е');
  c = { raw: raw, lat: lat(raw), sk: skel(raw) }; HC.set(t, c);
  return c;
}
function matchTok(h, w){
  if (h.raw.indexOf(w) >= 0) return true;
  var l = lat(w); if (l.length >= 2 && h.lat.indexOf(l) >= 0) return true;
  var k = skel(w); return k.length >= 3 && h.sk.indexOf(k) >= 0;
}
function search(X, q, type){
  var p = parseQ(q);
  return X.filter(function(t){
    if (type === 'spend' && !t.spend) return false;
    if (type === 'in' && !(t.amount > 0 && t.kind !== 'refund')) return false;
    if (type === 'tr' && !/transfer|self/.test(t.kind)) return false;
    var a = Math.abs(t.amount);
    if (p.min != null && a < p.min) return false;
    if (p.max != null && a > p.max) return false;
    for (var i = 0; i < p.exact.length; i++) if (Math.abs(a - p.exact[i]) >= 1) return false;
    if (p.text.length){ var h = hay(t); for (var j = 0; j < p.text.length; j++) if (!matchTok(h, p.text[j])) return false; }
    return true;
  });
}

/* ---------- экран поиска ---------- */
var SQ = { q: '', type: 'all', sort: 'new', limit: 150, pick: null };
M.openSearch = function(q){ SQ.q = q || ''; SQ.pick = null; SQ.limit = 150; P.view = 'search'; M.render(); window.scrollTo(0, 0); };
M.VIEWS.search = function(){
  var X = M.VT(), s = S(), el = $('#v-search');
  var h = '<div class="stack"><div class="sbox"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input type="search" id="sq" placeholder="Магазин, компания, человек или сумма" value="' + esc(SQ.q) + '" autocomplete="off" enterkeyhint="search">' + (SQ.q ? '<button class="sclear" id="sqx" aria-label="Очистить">×</button>' : '') + '</div>' +
    '<div class="chips">' + [['all', 'Всё'], ['spend', 'Траты'], ['in', 'Поступления'], ['tr', 'Переводы']].map(function(x){ return '<button class="chip ' + (SQ.type === x[0] ? 'on' : '') + '" data-st="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  if (!SQ.q.trim()){
    h += searchHome(X, s);
    el.innerHTML = h + '</div>'; bindSearch(); return;
  }
  HC = new WeakMap();
  var res = search(X, SQ.q, SQ.type);
  var groups = {}; res.forEach(function(t){ var k = nameOf(t); var g = groups[k] = groups[k] || { k: k, n: 0, out: 0, inn: 0, cat: t.cat, last: t.date }; g.n++; if (t.amount < 0) g.out -= t.amount; else g.inn += t.amount; if (t.date > g.last) g.last = t.date; });
  var gl = Object.keys(groups).map(function(k){ return groups[k]; }).sort(function(a, b){ return (b.out + b.inn) - (a.out + a.inn); });
  var list = SQ.pick ? res.filter(function(t){ return nameOf(t) === SQ.pick; }) : res;
  if (!list.length){
    h += '<div class="card"><p style="margin:0">Ничего не нашлось по запросу «' + esc(SQ.q) + '».</p><p class="muted" style="margin:8px 0 0">Попробуйте часть названия («винлаб», «яндекс»), сумму («990»), диапазон («500-1000», «>5000», «от 3к»). Поиск идёт по всей истории' + (s.accSel && s.accSel !== 'all' ? ' выбранного счёта' : '') + '.</p></div>';
    el.innerHTML = h + '</div>'; bindSearch(); return;
  }
  var out = 0, inn = 0, spend = 0; list.forEach(function(t){ if (t.amount < 0) out -= t.amount; else inn += t.amount; spend += t.spend || 0; });
  var first = list.reduce(function(m, t){ return t.date < m ? t.date : m; }, '9999'), last = list.reduce(function(m, t){ return t.date > m ? t.date : m; }, '0000');
  var days = daysBetween(first, last), weeks = Math.max(1, days / 7), mons = Math.max(1, days / 30.44);
  var freq = list.length < 2 ? 'один раз' : list.length / weeks >= 1 ? times(list.length / weeks, 'в неделю') : list.length / mons >= 1 ? times(list.length / mons, 'в месяц') : 'реже раза в месяц';
  var maxT = list.reduce(function(m, t){ return Math.abs(t.amount) > Math.abs(m.amount) ? t : m; }, list[0]);
  h += '<div class="card sres"><div class="sres-h">' + (SQ.pick ? '<button class="chip on" id="unpick">' + esc(SQ.pick) + ' ×</button>' : '<span class="muted">Найдено</span>') + '</div>' +
    '<div class="big">' + nf(list.length) + ' ' + plur(list.length, 'операция', 'операции', 'операций') + '</div>' +
    '<div class="kv">' +
      (out ? '<div><span>Списано</span><b>' + rub0(out) + '</b></div>' : '') +
      (inn ? '<div><span>Поступило</span><b class="pos">' + rub0(inn) + '</b></div>' : '') +
      '<div><span>Средняя сумма</span><b>' + rub0((out + inn) / list.length) + '</b></div>' +
      '<div><span>Как часто</span><b>' + freq + '</b></div>' +
      '<div><span>Первая</span><b>' + M.fmtD(first) + '</b></div>' +
      '<div><span>Последняя</span><b>' + M.fmtD(last) + '</b></div>' +
      (out && mons >= 2 ? '<div><span>В среднем в месяц</span><b>' + rub0(out / mons) + '</b></div><div><span>В год выходит</span><b>' + rub0(out / mons * 12) + '</b></div>' : '') +
      '<div class="w"><span>Самая крупная</span><b>' + M.rub(maxT.amount, true) + ' · ' + M.fmtD(maxT.date) + '</b></div>' +
    '</div>' + (spend && s.tx.length ? '<div class="note">Это ' + pctTxt(spend, M.sumSpend(X)) + ' всех ваших трат за историю.</div>' : '') + '</div>';
  h += '<div class="card"><h2>По месяцам <small>нажмите на столбец</small></h2><div class="cbox" style="height:190px"><canvas id="sqChart"></canvas></div></div>';
  if (!SQ.pick && gl.length > 1){
    var mx = gl[0].out + gl[0].inn;
    h += '<div class="card"><h2>Где и с кем <small>' + gl.length + ' ' + plur(gl.length, 'место', 'места', 'мест') + '</small></h2><div class="rows">' + gl.slice(0, 12).map(function(g){
      var v = g.out + g.inn;
      return '<button class="row" data-pick="' + esc(g.k) + '"><span class="dot" style="background:' + M.color(g.cat) + '"></span><span class="name">' + esc(g.k) + '</span><span class="amt' + (g.inn > g.out ? ' pos' : '') + '">' + (g.inn > g.out ? '+' : '') + rub0(v) + '</span><span class="meta"><span class="bar"><i style="width:' + Math.max(2, v / mx * 100) + '%;background:' + M.color(g.cat) + '"></i></span>' + g.n + ' раз · последний ' + M.fmtD(g.last) + '</span></button>';
    }).join('') + '</div>' + (gl.length > 12 ? '<p class="muted" style="margin:8px 0 0">И ещё ' + (gl.length - 12) + '. Уточните запрос.</p>' : '') + '</div>';
  }
  var sorted = list.slice().sort(SQ.sort === 'big' ? function(a, b){ return Math.abs(b.amount) - Math.abs(a.amount); } : function(a, b){ return (b.date + b.time).localeCompare(a.date + a.time); });
  h += '<div class="card" style="padding-top:12px"><h2>Операции <span class="toggle"><button data-so="new" class="' + (SQ.sort === 'new' ? 'on' : '') + '">новые</button><button data-so="big" class="' + (SQ.sort === 'big' ? 'on' : '') + '">крупные</button></span></h2>';
  var day = '';
  sorted.slice(0, SQ.limit).forEach(function(t){
    if (SQ.sort === 'new' && t.date !== day){ day = t.date; h += '<div class="day-h"><span>' + M.fmtD(day) + '</span><span></span></div>'; }
    h += M.opRow(t).replace('<span class="meta">', '<span class="meta">' + (SQ.sort === 'big' ? M.fmtD(t.date) + ' · ' : ''));
  });
  if (sorted.length > SQ.limit) h += '<button class="btn ghost wide" id="sqMore" style="margin-top:10px">Показать ещё ' + Math.min(300, sorted.length - SQ.limit) + '</button>';
  h += '</div></div>';
  el.innerHTML = h; bindSearch();
  // график по месяцам
  var ms = monthsOf(X).all, by = {}; list.forEach(function(t){ var k = mk(t.date); by[k] = by[k] || { o: 0, i: 0 }; if (t.amount < 0) by[k].o -= t.amount; else by[k].i += t.amount; });
  var hasIn = inn > 0, hasOut = out > 0;
  M.chart('sqChart', { type: 'bar', data: { labels: ms.map(monName), datasets: [].concat(hasOut ? [{ label: 'Списано', data: ms.map(function(k){ return by[k] ? Math.round(by[k].o) : 0; }), backgroundColor: '#141413', borderRadius: 4 }] : [], hasIn ? [{ label: 'Поступило', data: ms.map(function(k){ return by[k] ? Math.round(by[k].i) : 0; }), backgroundColor: '#3f7a57', borderRadius: 4 }] : []) },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: hasIn && hasOut }, tooltip: Object.assign(M.tipStyle(), { callbacks: { title: function(c){ return monFull(ms[c[0].dataIndex]); }, label: function(c){ return c.dataset.label + ': ' + rub0(c.raw); } } }) },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } }, y: { grid: { color: '#efece5' }, ticks: { callback: function(v){ return v >= 1000 ? Math.round(v / 1000) + 'k' : v; } } } },
      onClick: function(e, els){ if (!els.length) return; P.mode = 'month'; P.anchor = ms[els[0].index] + '-01'; P.view = 'ops'; P.q = SQ.pick || SQ.q; M.render(); window.scrollTo(0, 0); } } });
};
function pctTxt(a, b){ var p = b ? a / b * 100 : 0; return (p < 1 ? p.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : Math.round(p)) + '%'; }
function searchHome(X, s){
  var h = '';
  var rq = (s.recentQ || []).filter(Boolean);
  if (rq.length) h += '<div class="card"><h2>Недавние запросы</h2><div class="chips wrap">' + rq.map(function(q){ return '<button class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div></div>';
  var m = {}; X.forEach(function(t){ if (!t.spend) return; m[t.merchant] = (m[t.merchant] || 0) + 1; });
  var top = Object.keys(m).sort(function(a, b){ return m[b] - m[a]; }).slice(0, 14);
  if (top.length) h += '<div class="card"><h2>Частые места</h2><div class="chips wrap">' + top.map(function(k){ return '<button class="chip" data-q="' + esc(k) + '">' + esc(k) + ' <span class="muted">' + m[k] + '</span></button>'; }).join('') + '</div></div>';
  h += '<div class="card"><h2>Как искать</h2><div class="rows hint">' +
    [['винлаб', 'по названию — можно по-русски, найдёт и WINELAB'], ['990', 'точная сумма'], ['500-1000', 'диапазон сумм'], ['>5000', 'дороже 5 000 ₽ (или «от 5к»)'], ['такси <300', 'можно сочетать: такси дешевле 300 ₽'], ['Кафе и рестораны', 'вся категория']]
      .map(function(x){ return '<button class="row" data-q="' + esc(x[0]) + '"><span></span><span class="name"><b>' + esc(x[0]) + '</b></span><span class="amt"></span><span class="meta">' + x[1] + '</span></button>'; }).join('') + '</div></div>';
  return h;
}
function remember(q){ var s = S(); q = q.trim(); if (!q) return; s.recentQ = [q].concat((s.recentQ || []).filter(function(x){ return x !== q; })).slice(0, 8); M.save(); }
function bindSearch(){
  var qi = $('#sq');
  qi.oninput = function(){ SQ.q = qi.value; SQ.pick = null; SQ.limit = 150; clearTimeout(bindSearch.t); bindSearch.t = setTimeout(function(){ M.VIEWS.search(); var n = $('#sq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); clearTimeout(bindSearch.r); bindSearch.r = setTimeout(function(){ remember(SQ.q); }, 2500); };
  qi.onkeydown = function(e){ if (e.key === 'Enter'){ remember(qi.value); qi.blur(); } };
  var x = $('#sqx'); if (x) x.onclick = function(){ SQ.q = ''; SQ.pick = null; M.VIEWS.search(); $('#sq').focus(); };
  $$('#v-search [data-st]').forEach(function(b){ b.onclick = function(){ SQ.type = b.dataset.st; SQ.pick = null; M.VIEWS.search(); }; });
  $$('#v-search [data-so]').forEach(function(b){ b.onclick = function(){ SQ.sort = b.dataset.so; M.VIEWS.search(); }; });
  $$('#v-search [data-q]').forEach(function(b){ b.onclick = function(){ SQ.q = b.dataset.q; SQ.pick = null; remember(SQ.q); M.VIEWS.search(); window.scrollTo(0, 0); }; });
  $$('#v-search [data-pick]').forEach(function(b){ b.onclick = function(){ SQ.pick = b.dataset.pick; M.VIEWS.search(); window.scrollTo(0, 0); }; });
  var u = $('#unpick'); if (u) u.onclick = function(){ SQ.pick = null; M.VIEWS.search(); };
  var mo = $('#sqMore'); if (mo) mo.onclick = function(){ SQ.limit += 300; M.VIEWS.search(); };
  $$('#v-search [data-op]').forEach(function(b){ b.onclick = function(){ M.opSheet(b.dataset.op); }; });
}

/* ---------- глубокий анализ ---------- */
var periodInsights = M.VIEWS.insights;
M.VIEWS.insights = function(){
  var tg = '<div class="seg2"><button data-am="deep" class="' + (P.amode !== 'period' ? 'on' : '') + '">Вся история</button><button data-am="period" class="' + (P.amode === 'period' ? 'on' : '') + '">За период</button></div>';
  if (P.amode === 'period'){ periodInsights(); $('#v-insights').insertAdjacentHTML('afterbegin', tg); }
  else deepView(tg);
  $$('#v-insights [data-am]').forEach(function(b){ b.onclick = function(){ P.amode = b.dataset.am; M.render(); }; });
};
function deepView(tg){
  var X = M.VT(), mo = monthsOf(X), s = S();
  var spendTx = X.filter(function(t){ return t.spend; }), total = M.sumSpend(X);
  var byM = {}, inM = {}; mo.all.forEach(function(k){ byM[k] = 0; inM[k] = 0; });
  X.forEach(function(t){ var k = mk(t.date); if (t.spend) byM[k] += t.spend; if (t.amount > 0 && /transfer_in|income|cash_in|cashback/.test(t.kind)) inM[k] += t.amount; });
  var full = mo.full.length ? mo.full : mo.all, avgM = full.reduce(function(a, k){ return a + byM[k]; }, 0) / Math.max(1, full.length);
  var days = daysBetween(M.dataMin(), M.dataMax());
  var h = tg + '<div class="grid">';
  h += '<div class="card hero2"><div class="muted">' + M.fmtD(M.dataMin()) + ' — ' + M.fmtD(M.dataMax()) + ' · ' + mo.all.length + ' ' + plur(mo.all.length, 'месяц', 'месяца', 'месяцев') + '</div>' +
    '<div class="big">' + rub0(total) + '</div><div class="muted" style="margin-top:-4px">потрачено на покупки за всю историю</div>' +
    '<div class="kv" style="margin-top:14px"><div><span>В среднем в месяц</span><b>' + rub0(avgM) + '</b></div><div><span>В день</span><b>' + rub0(total / days) + '</b></div>' +
    '<div><span>Покупок</span><b>' + nf(spendTx.filter(function(t){ return t.kind === 'purchase'; }).length) + '</b></div><div><span>Мест</span><b>' + nf(Object.keys(spendTx.reduce(function(m, t){ m[t.merchant] = 1; return m; }, {})).length) + '</b></div></div></div>';
  h += '<div class="card"><h2>Главное <small>что видно по выпискам</small></h2><div class="facts">' + facts(X, mo, byM, avgM, total).map(function(f){ return '<div class="fact"' + (f.go ? ' data-fgo="' + esc(f.go) + '" role="button"' : '') + (f.q ? ' data-fq="' + esc(f.q) + '" role="button"' : '') + '><span class="fi" style="background:' + (f.c || '#141413') + '">' + f.i + '</span><div>' + f.t + '</div></div>'; }).join('') + '</div></div>';
  h += '<div class="card"><h2>Траты по месяцам <small>нажмите на месяц</small></h2><div class="cbox" style="height:240px"><canvas id="dmChart"></canvas></div><div class="note">Столбцы — покупки по категориям, линия — поступления. Пунктир — ваш средний месяц (' + rub0(avgM) + ').</div></div>';
  h += '<div class="card"><h2>Тренды категорий <small>последние 3 мес. к предыдущим</small></h2>' + trendsHtml(X, mo, full) + '</div>';
  h += '<div class="card"><h2>Размер чека <small>из чего складываются траты</small></h2>' + checksHtml(spendTx, mo) + '</div>';
  h += '<div class="card"><h2>Будни и выходные</h2>' + weekHtml(spendTx) + '</div>';
  h += '<div class="card"><h2>Новые и забытые места</h2>' + newOldHtml(X) + '</div>';
  h += '<div class="card"><h2>Самые дорогие дни</h2>' + topDaysHtml(spendTx) + '</div>';
  h += '</div>';
  $('#v-insights').innerHTML = h;
  $$('#v-insights [data-fq], #v-insights [data-sq]').forEach(function(b){ b.onclick = function(){ var q = b.dataset.fq || b.dataset.sq; remember(q); M.openSearch(q); }; });
  $$('#v-insights [data-fgo], #v-insights [data-day]').forEach(function(b){ b.onclick = function(){ P.mode = 'day'; P.anchor = b.dataset.fgo || b.dataset.day; P.view = 'ops'; P.q = ''; P.cat = null; M.render(); window.scrollTo(0, 0); }; });
  monthChart(X, mo, byM, inM, avgM);
}
function catMonthly(X, ms){ var c = {}; X.forEach(function(t){ if (!t.spend) return; var k = mk(t.date); if (ms.indexOf(k) < 0) return; c[t.cat] = c[t.cat] || {}; c[t.cat][k] = (c[t.cat][k] || 0) + t.spend; }); return c; }
function monthChart(X, mo, byM, inM, avgM){
  var ms = mo.all, cm = catMonthly(X, ms);
  var cats = Object.keys(cm).map(function(c){ return { c: c, v: ms.reduce(function(a, k){ return a + (cm[c][k] || 0); }, 0) }; }).sort(function(a, b){ return b.v - a.v; });
  var topC = cats.slice(0, 6).map(function(x){ return x.c; });
  var ds = topC.map(function(c){ return { type: 'bar', label: c, data: ms.map(function(k){ return Math.max(0, Math.round(cm[c][k] || 0)); }), backgroundColor: M.color(c), stack: 's', borderRadius: 2 }; });
  ds.push({ type: 'bar', label: 'Остальное', data: ms.map(function(k){ return Math.max(0, Math.round(byM[k] - topC.reduce(function(a, c){ return a + (cm[c][k] || 0); }, 0))); }), backgroundColor: '#d9d4ca', stack: 's', borderRadius: 2 });
  ds.push({ type: 'line', label: 'Поступления', data: ms.map(function(k){ return Math.round(inM[k]); }), borderColor: '#3f7a57', backgroundColor: '#3f7a57', pointRadius: 2, borderWidth: 2, tension: .3, stack: 'in' });
  ds.push({ type: 'line', label: 'Средний месяц', data: ms.map(function(){ return Math.round(avgM); }), borderColor: '#b9832f', borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, stack: 'avg' });
  M.chart('dmChart', { data: { labels: ms.map(monName), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: Object.assign(M.tipStyle(), { displayColors: true, callbacks: { title: function(c){ var k = ms[c[0].dataIndex]; return monFull(k) + ' · покупки ' + rub0(byM[k]); }, label: function(c){ return c.raw ? ' ' + c.dataset.label + ': ' + rub0(c.raw) : null; } }, filter: function(i){ return i.raw > 0 && i.dataset.label !== 'Средний месяц'; } }) },
    scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } }, y: { stacked: true, grid: { color: '#efece5' }, ticks: { callback: function(v){ return v >= 1000 ? Math.round(v / 1000) + 'k' : v; } } } },
    onClick: function(e, els){ if (!els.length) return; P.mode = 'month'; P.anchor = ms[els[0].index] + '-01'; P.view = 'overview'; M.render(); window.scrollTo(0, 0); } } });
}
function facts(X, mo, byM, avgM, total){
  var F = [], spendTx = X.filter(function(t){ return t.spend; });
  if (!spendTx.length) return [{ i: '?', t: 'Покупок пока нет — загрузите выписку.' }];
  var nM = Math.max(1, daysBetween(M.dataMin(), M.dataMax()) / 30.44);
  // 1. главное место
  var mm = {}; spendTx.forEach(function(t){ if (t.kind !== 'purchase') return; var x = mm[t.merchant] = mm[t.merchant] || { k: t.merchant, v: 0, n: 0, cat: t.cat }; x.v += t.spend; x.n++; });
  var ml = Object.keys(mm).map(function(k){ return mm[k]; }).sort(function(a, b){ return b.v - a.v; });
  if (ml[0]) F.push({ i: '1', c: M.color(ml[0].cat), q: ml[0].k, t: 'Больше всего денег уходит в <b>' + esc(ml[0].k) + '</b>: ' + rub0(ml[0].v) + ' — это ' + pctTxt(ml[0].v, total) + ' всех трат. ' + nf(ml[0].n) + ' ' + plur(ml[0].n, 'покупка', 'покупки', 'покупок') + ', в среднем ' + rub0(ml[0].v / nM) + ' в месяц.' });
  var top3 = ml.slice(0, 3).reduce(function(a, x){ return a + x.v; }, 0);
  if (ml.length > 5) F.push({ i: '3', t: 'Три главных места — ' + ml.slice(0, 3).map(function(x){ return esc(x.k); }).join(', ') + ' — забирают <b>' + pctTxt(top3, total) + '</b> всех трат (' + rub0(top3) + ').' });
  // 2. категория с ростом
  var full = mo.full;
  if (full.length >= 4){
    var l3 = full.slice(-3), p3 = full.slice(-6, -3); if (!p3.length) p3 = full.slice(0, -3);
    var cm = catMonthly(X, full), best = null;
    Object.keys(cm).forEach(function(c){ var a = l3.reduce(function(s, k){ return s + (cm[c][k] || 0); }, 0) / l3.length, b = p3.reduce(function(s, k){ return s + (cm[c][k] || 0); }, 0) / p3.length; var d = a - b; if (b > 1000 && (!best || d > best.d)) best = { c: c, a: a, b: b, d: d }; });
    if (best && best.d > 0) F.push({ i: '↑', c: '#b5523b', q: best.c, t: 'Быстрее всего растут траты на <b>«' + esc(best.c) + '»</b>: ' + rub0(best.a) + ' в месяц за последние 3 месяца против ' + rub0(best.b) + ' раньше (' + sgn(pc(best.d, best.b)) + ').' });
    var worst = null; Object.keys(cm).forEach(function(c){ var a = l3.reduce(function(s, k){ return s + (cm[c][k] || 0); }, 0) / l3.length, b = p3.reduce(function(s, k){ return s + (cm[c][k] || 0); }, 0) / p3.length; var d = a - b; if (b > 1000 && (!worst || d < worst.d)) worst = { c: c, a: a, b: b, d: d }; });
    if (worst && worst.d < 0) F.push({ i: '↓', c: '#3f7a57', q: worst.c, t: 'Сильнее всего сократились траты на <b>«' + esc(worst.c) + '»</b>: ' + rub0(worst.a) + ' в месяц вместо ' + rub0(worst.b) + ' (' + sgn(pc(worst.d, worst.b)) + ').' });
  }
  // 3. мелочи
  var small = spendTx.filter(function(t){ return t.kind === 'purchase' && t.spend < 500; }), sv = small.reduce(function(a, t){ return a + t.spend; }, 0);
  if (small.length > 20) F.push({ i: '₽', c: '#8e8a80', q: '<500', t: 'Покупки дешевле 500 ₽ кажутся мелочью, но их ' + nf(small.length) + ' на ' + rub0(sv) + ' — примерно <b>' + rub0(sv / nM) + ' в месяц</b>.' });
  // 4. вредные привычки (алкоголь, кафе, такси) — годовая сумма
  ['Алкоголь и табак', 'Кафе и рестораны', 'Такси', 'Сервисы Яндекса'].forEach(function(c){
    var v = spendTx.filter(function(t){ return t.cat === c; }).reduce(function(a, t){ return a + t.spend; }, 0), n = spendTx.filter(function(t){ return t.cat === c; }).length;
    if (v > total * 0.07) F.push({ i: '%', c: M.color(c), q: c, t: '<b>' + esc(c) + '</b> — ' + pctTxt(v, total) + ' трат: ' + rub0(v / nM) + ' в месяц, это ≈ <b>' + rub0(v / nM * 12) + ' в год</b>. ' + (n / (nM * 4.35) >= 1 ? 'В среднем ' + times(n / (nM * 4.35), 'в неделю') + '.' : '') });
  });
  // 5. ночные траты
  var timed = spendTx.filter(function(t){ return t.time && t.time !== '00:00'; });
  if (timed.length > spendTx.length * 0.5){
    var night = timed.filter(function(t){ var hh = +t.time.slice(0, 2); return hh >= 23 || hh < 5; }), nv = night.reduce(function(a, t){ return a + t.spend; }, 0);
    if (night.length > 10){ var nc = {}; night.forEach(function(t){ nc[t.cat] = (nc[t.cat] || 0) + t.spend; }); var top = Object.keys(nc).sort(function(a, b){ return nc[b] - nc[a]; })[0];
      F.push({ i: '☾', c: '#3f5f8a', t: 'Ночью (с 23 до 5) вы потратили ' + rub0(nv) + ' — ' + nf(night.length) + ' ' + plur(night.length, 'покупка', 'покупки', 'покупок') + '. Чаще всего — <b>' + esc(top) + '</b> (' + rub0(nc[top]) + ').' }); }
  }
  // 6. дни без трат
  var dset = {}; spendTx.forEach(function(t){ if (t.kind === 'purchase') dset[t.date] = 1; });
  var allD = daysBetween(M.dataMin(), M.dataMax()), noSpend = allD - Object.keys(dset).length;
  F.push({ i: '0', c: '#5b7f5e', t: 'Дней совсем без покупок: <b>' + noSpend + ' из ' + allD + '</b> (' + pctTxt(noSpend, allD) + ').' + (noSpend < allD * 0.1 ? ' Почти каждый день что-то покупается.' : '') });
  // 7. расходы больше поступлений
  var over = (mo.full.length ? mo.full : mo.all).filter(function(k){ var inn = X.filter(function(t){ return mk(t.date) === k && t.amount > 0 && /transfer_in|income|cash_in/.test(t.kind); }).reduce(function(a, t){ return a + t.amount; }, 0); return byM[k] > inn && inn > 0; });
  if (over.length) F.push({ i: '!', c: '#b5523b', t: 'В ' + over.length + ' ' + plur(over.length, 'месяце', 'месяцах', 'месяцах') + ' покупки превысили все поступления: ' + over.slice(-4).map(monFull).join(', ') + '.' });
  // 8. самый дорогой день
  var dd = {}; spendTx.forEach(function(t){ dd[t.date] = (dd[t.date] || 0) + t.spend; });
  var bd = Object.keys(dd).sort(function(a, b){ return dd[b] - dd[a]; })[0];
  if (bd) F.push({ i: '★', c: '#b9832f', go: bd, t: 'Самый дорогой день — <b>' + M.fmtD(bd) + '</b>: ' + rub0(dd[bd]) + '. Нажмите, чтобы посмотреть.' });
  return F;
}
function spark(vals, col){
  var w = 84, hh = 26, mx = Math.max.apply(null, vals.concat([1]));
  var pts = vals.map(function(v, i){ return (vals.length < 2 ? w : i / (vals.length - 1) * w).toFixed(1) + ',' + (hh - 2 - v / mx * (hh - 4)).toFixed(1); }).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + hh + '" width="' + w + '" height="' + hh + '"><polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function trendsHtml(X, mo, full){
  var ms = mo.all, cm = catMonthly(X, ms);
  var l3 = full.slice(-3), p3 = full.slice(-6, -3); if (!p3.length) p3 = full.slice(0, -3);
  var rows = Object.keys(cm).map(function(c){
    var vals = (full.length >= 2 ? full : ms).map(function(k){ return cm[c][k] || 0; });
    var avg = full.reduce(function(a, k){ return a + (cm[c][k] || 0); }, 0) / Math.max(1, full.length);
    var a = l3.length ? l3.reduce(function(s, k){ return s + (cm[c][k] || 0); }, 0) / l3.length : 0, b = p3.length ? p3.reduce(function(s, k){ return s + (cm[c][k] || 0); }, 0) / p3.length : 0;
    return { c: c, vals: vals, avg: avg, d: b > 500 ? pc(a - b, b) : null, sum: vals.reduce(function(x, y){ return x + y; }, 0) };
  }).sort(function(a, b){ return b.sum - a.sum; }).slice(0, 14);
  if (!rows.length) return '<p class="muted">Нет данных.</p>';
  return '<div class="trends">' + rows.map(function(r){
    return '<button class="trow" data-sq="' + esc(r.c) + '"><span class="dot" style="background:' + M.color(r.c) + '"></span><span class="tn">' + esc(r.c) + '<small>' + rub0(r.avg) + ' / мес</small></span>' + spark(r.vals, M.color(r.c)) +
      '<span class="td ' + (r.d == null ? '' : r.d > 10 ? 'up' : r.d < -10 ? 'down' : '') + '">' + (r.d == null ? '—' : sgn(r.d)) + '</span></button>';
  }).join('') + '</div><div class="note">Линия — траты по полным месяцам за всю историю. Процент — средние траты за последние 3 полных месяца по сравнению с тремя месяцами до них. Красный — растёт, зелёный — снижается.</div>';
}
function checksHtml(spendTx, mo){
  var B = [[0, 300, 'до 300 ₽'], [300, 1000, '300–1 000 ₽'], [1000, 3000, '1–3 тыс. ₽'], [3000, 10000, '3–10 тыс. ₽'], [10000, 1e12, 'от 10 тыс. ₽']];
  var buys = spendTx.filter(function(t){ return t.kind === 'purchase'; }), tot = buys.reduce(function(a, t){ return a + t.spend; }, 0);
  var r = B.map(function(b){ var l = buys.filter(function(t){ return t.spend >= b[0] && t.spend < b[1]; }); return { b: b, n: l.length, v: l.reduce(function(a, t){ return a + t.spend; }, 0) }; });
  var mx = Math.max.apply(null, r.map(function(x){ return x.v; }).concat([1]));
  var q = ['<300', '300-1000', '1000-3000', '3000-10000', '>10000'];
  return '<div class="rows">' + r.map(function(x, i){ return '<button class="row" data-sq="' + q[i] + '"><span></span><span class="name">' + x.b[2] + '</span><span class="amt">' + rub0(x.v) + '</span><span class="meta"><span class="bar"><i style="width:' + Math.max(2, x.v / mx * 100) + '%;background:#141413"></i></span>' + nf(x.n) + ' шт. · ' + pctTxt(x.v, tot) + ' суммы · ' + pctTxt(x.n, buys.length) + ' покупок</span></button>'; }).join('') + '</div>' +
    '<div class="note">Нажмите на строку — откроется поиск с этими покупками. Медианный чек: ' + rub0(median(buys.map(function(t){ return t.spend; }))) + '.</div>';
}
function median(a){ if (!a.length) return 0; var b = a.slice().sort(function(x, y){ return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function weekHtml(spendTx){
  var dd = {}; spendTx.forEach(function(t){ dd[t.date] = (dd[t.date] || 0) + t.spend; });
  var wd = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  var d = M.parseD(M.dataMin()), end = M.parseD(M.dataMax());
  while (d <= end){ var k = M.ymd(d), i = (d.getDay() + 6) % 7; wd[i] += dd[k] || 0; cnt[i]++; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
  var avg = wd.map(function(v, i){ return cnt[i] ? v / cnt[i] : 0; }), mx = Math.max.apply(null, avg.concat([1]));
  var wk = (avg[0] + avg[1] + avg[2] + avg[3] + avg[4]) / 5, we = (avg[5] + avg[6]) / 2;
  return '<p style="margin:0 0 12px">В выходной день вы тратите в среднем <b>' + rub0(we) + '</b>, в будний — <b>' + rub0(wk) + '</b>' + (wk ? ' (' + (we > wk ? 'в ' + (we / wk).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' раза больше' : 'меньше') + ')' : '') + '.</p>' +
    '<div class="wbars">' + avg.map(function(v, i){ return '<div><span class="wv">' + (v >= 1000 ? (v / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + 'k' : Math.round(v)) + '</span><i style="height:' + Math.max(3, v / mx * 100) + '%;background:' + (i >= 5 ? '#141413' : '#cfcabf') + '"></i><span>' + M.WD[i] + '</span></div>'; }).join('') + '</div><div class="note">Средние траты за один день недели по всей истории.</div>';
}
function newOldHtml(X){
  var mx = M.dataMax(), d60 = M.ymd(new Date(M.parseD(mx).getTime() - 60 * 864e5)), m = {};
  X.forEach(function(t){ if (t.kind !== 'purchase') return; var x = m[t.merchant] = m[t.merchant] || { k: t.merchant, first: t.date, last: t.date, n: 0, v: 0, rv: 0, cat: t.cat }; if (t.date < x.first) x.first = t.date; if (t.date > x.last) x.last = t.date; x.n++; x.v += t.spend; if (t.date >= d60) x.rv += t.spend; });
  var L = Object.keys(m).map(function(k){ return m[k]; });
  var hasOld = M.dataMin() < M.ymd(new Date(M.parseD(mx).getTime() - 150 * 864e5));
  var nw = hasOld ? L.filter(function(x){ return x.first >= d60; }).sort(function(a, b){ return b.v - a.v; }).slice(0, 6) : [];
  var gone = L.filter(function(x){ return x.last < d60 && x.n >= 5; }).sort(function(a, b){ return b.v - a.v; }).slice(0, 6);
  var row = function(x, meta){ return '<button class="row" data-sq="' + esc(x.k) + '"><span class="dot" style="background:' + M.color(x.cat) + '"></span><span class="name">' + esc(x.k) + '</span><span class="amt">' + rub0(x.v) + '</span><span class="meta">' + meta + '</span></button>'; };
  var h = '';
  h += '<div class="sub">Появились за последние 2 месяца</div>' + (nw.length ? '<div class="rows">' + nw.map(function(x){ return row(x, 'впервые ' + M.fmtD(x.first) + ' · ' + x.n + ' раз'); }).join('') + '</div>' : '<p class="muted" style="margin:4px 0 10px">' + (hasOld ? 'Новых мест нет.' : 'Нужна история хотя бы за 5 месяцев.') + '</p>');
  h += '<div class="sub">Перестали ходить (нет покупок 2 месяца)</div>' + (gone.length ? '<div class="rows">' + gone.map(function(x){ return row(x, x.n + ' раз · последний ' + M.fmtD(x.last)); }).join('') + '</div>' : '<p class="muted" style="margin:4px 0 0">Таких мест нет.</p>');
  return h;
}
function topDaysHtml(spendTx){
  var dd = {}, dm = {}; spendTx.forEach(function(t){ dd[t.date] = (dd[t.date] || 0) + t.spend; var x = dm[t.date] = dm[t.date] || {}; x[t.merchant] = (x[t.merchant] || 0) + t.spend; });
  var top = Object.keys(dd).sort(function(a, b){ return dd[b] - dd[a]; }).slice(0, 5);
  return '<div class="rows">' + top.map(function(d){ var mm = dm[d], ks = Object.keys(mm).sort(function(a, b){ return mm[b] - mm[a]; }); return '<button class="row" data-day="' + d + '"><span></span><span class="name">' + M.fmtD(d) + '</span><span class="amt">' + rub0(dd[d]) + '</span><span class="meta">' + ks.slice(0, 3).map(function(k){ return esc(k) + ' ' + rub0(mm[k]); }).join(' · ') + '</span></button>'; }).join('') + '</div>';
}
})();
