(function(){
'use strict';
var M = window.MR; if (!M) return;
var $ = M.$, $$ = M.$$, esc = M.esc, rub0 = M.rub0, pct = M.pct, P = M.P;
var S = function(){ return M.S(); };
var PALETTE = ['#5b7f5e','#8a5a44','#c07a3e','#3f5f8a','#5a6f9e','#6e8fb5','#7c8c99','#9aa36b','#4f8a86','#b59a3c','#6b7a8f','#7b5ea7','#a3647f','#c46b6b','#9b6fb0','#5f9e8f','#8d7b68','#a08a4f','#3d3d3a','#b8b2a7'];
var whatif = {};

function mkey(s){ return s.slice(0, 7); }
function monthRange(anchor){ return M.range('month', anchor); }
function dim(anchor){ var d = M.parseD(anchor); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function spentBy(list, pred){ return list.reduce(function(s, t){ return s + (t.spend && (!pred || pred(t)) ? t.spend : 0); }, 0); }
function fullMonths(){
  var mn = M.dataMin(), mx = M.dataMax(), out = [];
  var d = M.parseD(mn); d = new Date(d.getFullYear(), d.getMonth(), 1);
  while (M.ymd(d) <= mx){ var r = monthRange(M.ymd(d)); if (r.s >= mn && r.e <= mx) out.push(r); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  return out;
}
// средние траты в месяц по категориям за последние 3 полных месяца до месяца плана
function baseline(beforeS){
  var ms = fullMonths().filter(function(r){ return r.e < beforeS; }).slice(-3);
  if (!ms.length) ms = fullMonths().slice(-3);
  var acc = {}, n = ms.length || 1;
  ms.forEach(function(r){ M.byCat(M.inR(r)).forEach(function(c){ acc[c.cat] = (acc[c.cat] || 0) + c.v; }); });
  var list = Object.keys(acc).map(function(k){ return { cat: k, v: acc[k] / n }; }).filter(function(x){ return x.v > 1; }).sort(function(a, b){ return b.v - a.v; });
  return { list: list, months: ms, total: list.reduce(function(s, x){ return s + x.v; }, 0) };
}
function monthName(r){ var d = M.parseD(r.s); return M.MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function monthNameP(r){ var d = M.parseD(r.s); return ['январём','февралём','мартом','апрелем','маем','июнем','июлем','августом','сентябрём','октябрём','ноябрём','декабрём'][d.getMonth()]; }
// сколько дней месяца уже «прошло» по данным
function elapsed(r){
  var mx = M.dataMax(), t = M.todayS(), lim = mx < t ? mx : t;
  if (lim < r.s) return 0;
  if (lim >= r.e) return dim(r.s);
  return M.parseD(lim).getDate();
}
function num(v){ return Math.round(+String(v).replace(/[^\d.,]/g, '').replace(',', '.') || 0); }

/* ================= ПЛАН ================= */
M.VIEWS.plan = function(){
  var r = monthRange(P.anchor), list = M.inR(r), spent = M.sumSpend(list), D = dim(r.s), el = elapsed(r);
  var pr = monthRange(M.shift('month', r.s, -1)), prevSpent = M.coverage(pr) === 'full' ? M.sumSpend(M.inR(pr)) : null;
  var done = el >= D, forecast = el ? spent / el * D : 0;
  var base = baseline(r.s);
  var h = '<div class="grid">';
  h += '<p class="muted" style="margin:0;text-align:center">План считается по месяцу: <b>' + esc(monthName(r)) + '</b></p>';

  // Прогноз
  h += '<div class="card"><h2>Прогноз на конец месяца</h2>';
  if (!el) h += '<p class="muted">По этому месяцу ещё нет данных. Загрузите свежую выписку.</p>';
  else {
    var diff = prevSpent ? (forecast - prevSpent) / prevSpent * 100 : null;
    h += '<div class="big2">' + (done ? rub0(spent) : '≈ ' + rub0(forecast)) + '</div><p style="margin:4px 0 0">' +
      (done ? 'Месяц завершён: потрачено ' + rub0(spent) + '.' : 'Сейчас ' + el + '-е число, потрачено ' + rub0(spent) + '. При нынешнем темпе (' + rub0(spent / el) + ' в день) к концу месяца выйдет около ' + rub0(forecast) + '.') +
      (diff !== null ? ' Это <span class="' + (diff > 0 ? 'up' : 'down') + '">на ' + Math.abs(diff).toFixed(0) + '% ' + (diff > 0 ? 'больше' : 'меньше') + '</span>, чем за ' + M.MONTHS[M.parseD(pr.s).getMonth()] + ' (' + rub0(prevSpent) + ').' : '') + '</p>' +
      '<div class="chartbox" style="height:200px;margin-top:10px"><canvas id="cFc"></canvas></div>' +
      '<div class="chips" style="margin-top:6px"><span class="chip"><span class="dot" style="background:#141413"></span>Этот месяц</span>' + (done ? '' : '<span class="chip"><span class="dot" style="background:#b9832f"></span>Прогноз</span>') + '<span class="chip"><span class="dot" style="background:#cfcabf"></span>Прошлый месяц</span></div>' +
      (M.dataMax() < M.todayS() && !done ? '<div class="note">Выписка заканчивается ' + M.fmtD(M.dataMax()) + ' — прогноз по этой дате. Загрузите новую выписку, чтобы уточнить.</div>' : '');
  }
  h += '</div>';

  // Лимиты
  var lims = S().limits, withL = Object.keys(lims).filter(function(c){ return lims[c] > 0; });
  var byC = {}; M.byCat(list).forEach(function(c){ byC[c.cat] = c.v; });
  h += '<div class="card"><h2>Лимиты по категориям <small>нажмите, чтобы изменить</small></h2>';
  if (withL.length){
    var tl = 0, ts = 0;
    h += '<div>' + withL.sort(function(a, b){ return (byC[b] || 0) / lims[b] - (byC[a] || 0) / lims[a]; }).map(function(c){
      var sp = byC[c] || 0, L = lims[c], proj = el && !done ? sp / el * D : sp, st = sp > L ? 'over' : proj > L * 0.95 || sp > L * 0.8 ? 'warn' : 'ok';
      tl += L; ts += sp;
      var col = st === 'over' ? '#b0533f' : st === 'warn' ? '#d39a45' : '#5b7f5e';
      return '<button class="lim row" style="display:block;grid-template-columns:none" data-lim="' + esc(c) + '"><div class="top"><span><span class="dot" style="background:' + M.color(c) + '"></span> ' + esc(c) + '</span><b>' + rub0(sp) + ' <span class="muted">из ' + rub0(L) + '</span></b></div>' +
        '<div class="bar"><i style="width:' + Math.min(100, sp / L * 100) + '%;background:' + col + '"></i>' + (done ? '' : '<span class="pace" style="left:' + (el / D * 100) + '%" title="Сегодня"></span>') + '</div>' +
        '<div class="sub"><span class="st-' + st + '">' + (sp > L ? 'Превышено на ' + rub0(sp - L) : 'Осталось ' + rub0(L - sp)) + '</span><span>' + (done ? '' : 'к концу месяца ≈ ' + rub0(proj)) + '</span></div></button>';
    }).join('') + '</div><div class="note">Всего по лимитам: ' + rub0(ts) + ' из ' + rub0(tl) + '. Чёрная черта — где вы должны быть сегодня при равномерных тратах.</div>';
  } else h += '<p class="muted">Лимитов пока нет. Выберите категорию ниже — предложу сумму по вашим средним тратам.</p>';
  var free = base.list.filter(function(x){ return !(lims[x.cat] > 0); }).slice(0, 8);
  if (free.length) h += '<div class="chips" style="flex-wrap:wrap;margin-top:10px">' + free.map(function(x){ return '<button class="chip" data-lim="' + esc(x.cat) + '"><span class="dot" style="background:' + M.color(x.cat) + '"></span>+ ' + esc(x.cat) + '</button>'; }).join('') + '</div>';
  h += '</div>';

  // Калькулятор
  h += '<div class="card"><h2>А если сократить? <small>двигайте ползунки</small></h2>';
  if (base.list.length){
    h += '<p class="muted" style="margin:0 0 6px">База — средние траты в месяц за ' + base.months.map(monthName).join(', ') + '.</p><div id="wiList">' +
      base.list.slice(0, 8).map(function(x, i){ var p = whatif[x.cat] || 0; return '<div class="slider"><div class="top"><span><span class="dot" style="background:' + M.color(x.cat) + '"></span> ' + esc(x.cat) + ' <span class="muted">' + rub0(x.v) + '/мес</span></span><b id="wv' + i + '">−' + p + '%</b></div><input type="range" min="0" max="100" step="5" value="' + p + '" data-wi="' + i + '" aria-label="Сократить ' + esc(x.cat) + '"><div class="sub muted" id="ws' + i + '" style="font-size:12px"></div></div>'; }).join('') +
      '</div><div class="note" id="wiTotal"></div><button class="btn ghost wide" id="wiApply" style="margin-top:10px">Сделать это лимитами на месяц</button>';
  } else h += '<p class="muted">Нужен хотя бы один полный месяц в выписке.</p>';
  h += '</div>';

  // Цели
  var goals = S().goals;
  h += '<div class="card"><h2>Цели накоплений</h2>';
  h += goals.length ? goals.map(function(g){
    var left = Math.max(0, g.target - (g.saved || 0)), ml = monthsLeft(g.date), per = ml > 0 ? left / ml : left;
    return '<div class="goal"><div class="lim"><div class="top"><b>' + esc(g.name) + '</b><span>' + rub0(g.saved || 0) + ' <span class="muted">из ' + rub0(g.target) + '</span></span></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, (g.saved || 0) / g.target * 100) + '%;background:#141413"></i></div>' +
      '<div class="sub"><span>' + (left <= 0 ? '<span class="st-ok">Цель достигнута</span>' : 'Откладывать ' + rub0(per) + ' в месяц') + '</span><span>до ' + M.fmtD(g.date) + (ml > 0 ? ' · ' + ml + ' мес.' : '') + '</span></div></div>' +
      '<div class="chips" style="margin-top:4px"><button class="chip" data-gadd="' + g.id + '">+ Отложил</button><button class="chip" data-gdel="' + g.id + '">Удалить</button></div></div>';
  }).join('') : '<p class="muted">Например: «Отпуск — 50 000 ₽ к марту». Посчитаю, сколько откладывать в месяц.</p>';
  h += '<button class="btn wide" id="gNew" style="margin-top:10px">Добавить цель</button><div class="note" id="gHint"></div></div>';
  h += '</div>';
  $('#v-plan').innerHTML = h;

  if (el) fcChart(r, list, pr, D, el, done, forecast);
  $$('#v-plan [data-lim]').forEach(function(b){ b.onclick = function(){ limitSheet(b.dataset.lim, base); }; });
  var upd = function(){
    var tot = 0;
    base.list.slice(0, 8).forEach(function(x, i){ var p = whatif[x.cat] || 0, sv = x.v * p / 100; tot += sv; $('#wv' + i).textContent = '−' + p + '%'; $('#ws' + i).textContent = p ? 'экономия ' + rub0(sv) + ' в месяц · новый лимит ' + rub0(x.v - sv) : ''; });
    var t = $('#wiTotal'); if (t) t.innerHTML = tot ? '<b>Экономия: ' + rub0(tot) + ' в месяц, ' + rub0(tot * 12) + ' в год.</b> Траты станут ' + rub0(base.total - tot) + ' вместо ' + rub0(base.total) + ' (−' + pct(tot, base.total) + ').' : 'Сдвиньте ползунок, чтобы посчитать экономию.';
    var gh = $('#gHint'); if (gh){ var need = S().goals.reduce(function(s, g){ var l = Math.max(0, g.target - (g.saved || 0)), m = monthsLeft(g.date); return s + (m > 0 ? l / m : l); }, 0); gh.hidden = !need; if (need) gh.innerHTML = 'На все цели нужно ' + rub0(need) + ' в месяц. ' + (tot ? (tot >= need ? '<span class="st-ok">Сокращений из калькулятора хватает</span> (' + rub0(tot) + ').' : 'Калькулятор даёт ' + rub0(tot) + ' — не хватает ' + rub0(need - tot) + '.') : 'Подвигайте ползунки выше, чтобы найти эти деньги.'); }
  };
  $$('#v-plan [data-wi]').forEach(function(inp){ inp.oninput = function(){ whatif[base.list[+inp.dataset.wi].cat] = +inp.value; upd(); }; });
  upd();
  var ap = $('#wiApply'); if (ap) ap.onclick = function(){ var n = 0; base.list.slice(0, 8).forEach(function(x){ var p = whatif[x.cat] || 0; if (p){ S().limits[x.cat] = Math.round(x.v * (1 - p / 100) / 100) * 100; n++; } }); if (!n) return M.toast('Сначала сдвиньте хотя бы один ползунок'); M.save(); M.render(); M.toast('Лимиты заданы: ' + n); };
  $('#gNew').onclick = goalSheet;
  $$('#v-plan [data-gadd]').forEach(function(b){ b.onclick = function(){ goalAdd(b.dataset.gadd); }; });
  $$('#v-plan [data-gdel]').forEach(function(b){ b.onclick = function(){ S().goals = S().goals.filter(function(g){ return g.id !== b.dataset.gdel; }); M.save(); M.render(); }; });
};
function monthsLeft(date){ var a = new Date(), b = M.parseD(date); return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() >= a.getDate() ? 0 : -1)) || (b > a ? 1 : 0); }
function cumul(list, r, n){ var out = [], s = 0, by = {}; list.forEach(function(t){ if (t.spend) by[t.date] = (by[t.date] || 0) + t.spend; }); var d = M.parseD(r.s); for (var i = 1; i <= n; i++){ s += by[M.ymd(d)] || 0; out.push(Math.round(s)); d.setDate(d.getDate() + 1); } return out; }
function fcChart(r, list, pr, D, el, done, forecast){
  var cur = cumul(list, r, D).map(function(v, i){ return i < el ? v : null; });
  var prevD = dim(pr.s), prev = M.coverage(pr) !== 'none' ? cumul(M.inR(pr), pr, prevD) : [];
  var fc = done ? [] : cur.map(function(v, i){ return i === el - 1 ? v : i >= el ? Math.round(cur[el - 1] + (forecast - cur[el - 1]) * (i - el + 1) / (D - el)) : null; });
  var labels = []; for (var i = 1; i <= D; i++) labels.push(String(i));
  M.chart('cFc', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Этот месяц', data: cur, borderColor: '#141413', backgroundColor: 'rgba(20,20,19,.06)', fill: true, tension: .3, pointRadius: 0, borderWidth: 2.5 },
    { label: 'Прогноз', data: fc, borderColor: '#b9832f', borderDash: [6, 5], pointRadius: 0, borderWidth: 2, tension: 0 },
    { label: 'Прошлый месяц', data: prev.slice(0, D), borderColor: '#cfcabf', pointRadius: 0, borderWidth: 2, tension: .3 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 11 } } }, y: { grid: { color: '#efece5' }, border: { display: false }, ticks: { font: { size: 11 }, callback: function(v){ return v >= 1000 ? Math.round(v / 1000) + 'k' : v; } } } },
      plugins: { tooltip: Object.assign(M.tipStyle(), { displayColors: true, callbacks: { title: function(i){ return i[0].label + '-е число'; }, label: function(i){ return i.raw == null ? null : i.dataset.label + ': ' + rub0(i.raw); } } }) } } });
}
function limitSheet(cat, base){
  var avg = (base.list.filter(function(x){ return x.cat === cat; })[0] || {}).v || 0, cur = S().limits[cat] || '';
  var r100 = function(v){ return Math.round(v / 100) * 100; };
  M.sheet('<h3><span class="dot" style="background:' + M.color(cat) + '"></span> ' + esc(cat) + '</h3><p class="muted">' + (avg ? 'В среднем вы тратите ' + rub0(avg) + ' в месяц.' : 'Средних трат нет.') + '</p>' +
    '<div class="stack"><label class="muted" for="limV">Лимит в месяц, ₽</label><input id="limV" type="text" inputmode="numeric" value="' + cur + '" placeholder="Например, 15000">' +
    (avg ? '<div class="chips">' + [[1, 'как обычно'], [0.9, '−10%'], [0.8, '−20%'], [0.7, '−30%']].map(function(x){ return '<button class="chip" data-sv="' + r100(avg * x[0]) + '">' + rub0(r100(avg * x[0])) + ' · ' + x[1] + '</button>'; }).join('') + '</div>' : '') +
    '<button class="btn" id="limSave">Сохранить лимит</button>' + (cur ? '<button class="btn danger" id="limDel">Убрать лимит</button>' : '') + '</div>');
  $$('[data-sv]').forEach(function(b){ b.onclick = function(){ $('#limV').value = b.dataset.sv; }; });
  $('#limSave').onclick = function(){ var v = num($('#limV').value); if (!v) return M.toast('Введите сумму'); S().limits[cat] = v; M.save(); M.closeSheet(); M.render(); M.toast('Лимит сохранён'); };
  var d = $('#limDel'); if (d) d.onclick = function(){ delete S().limits[cat]; M.save(); M.closeSheet(); M.render(); };
}
function goalSheet(){
  var d = new Date(); d.setMonth(d.getMonth() + 4);
  M.sheet('<h3>Новая цель</h3><div class="stack" style="margin-top:10px"><input id="gN" type="text" maxlength="40" placeholder="Название, например «Отпуск»"><input id="gT" type="text" inputmode="numeric" placeholder="Сколько нужно, ₽"><input id="gS" type="text" inputmode="numeric" placeholder="Уже отложено, ₽ (если есть)"><label class="muted" for="gD">К какой дате</label><input id="gD" type="date" value="' + M.ymd(d) + '" style="width:100%;font:inherit;padding:11px 12px;border:1px solid var(--line);border-radius:12px"><button class="btn" id="gOk">Создать цель</button></div>');
  $('#gOk').onclick = function(){ var n = $('#gN').value.trim(), t = num($('#gT').value), dt = $('#gD').value; if (!n || !t || !dt) return M.toast('Заполните название, сумму и дату'); S().goals.push({ id: 'g' + Date.now(), name: n, target: t, saved: num($('#gS').value), date: dt }); M.save(); M.closeSheet(); M.render(); M.toast('Цель создана'); };
}
function goalAdd(id){
  var g = S().goals.filter(function(x){ return x.id === id; })[0]; if (!g) return;
  M.sheet('<h3>' + esc(g.name) + '</h3><p class="muted">Отложено ' + rub0(g.saved || 0) + ' из ' + rub0(g.target) + '</p><div class="stack"><input id="gA" type="text" inputmode="numeric" placeholder="Сколько отложили, ₽"><button class="btn" id="gAok">Добавить</button></div>');
  $('#gAok').onclick = function(){ var v = num($('#gA').value); if (!v) return; g.saved = (g.saved || 0) + v; M.save(); M.closeSheet(); M.render(); M.toast(g.saved >= g.target ? 'Цель достигнута' : 'Добавлено'); };
}

/* ================= АНАЛИЗ ================= */
var topBy = 'sum', cmpMode = 'prev';
M.VIEWS.insights = function(){
  var r = M.range(P.mode, P.anchor), list = M.inR(r), spend = M.sumSpend(list);
  var h = '<div class="grid">';
  h += '<div class="sec">Итоги · ' + esc(M.label(P.mode, P.anchor)) + '</div>' + recap(r, list, spend);
  h += '<div class="card"><h2>Подписки и регулярные платежи <small>по всей истории</small></h2>' + subsHtml() + '</div>';
  h += '<div class="card"><h2>Топ мест <span class="toggle"><button data-tb="sum" class="' + (topBy === 'sum' ? 'on' : '') + '">по сумме</button><button data-tb="n" class="' + (topBy === 'n' ? 'on' : '') + '">по частоте</button></span></h2>' + topHtml(r, list, spend) + '</div>';
  h += '<div class="card"><h2>Привычки <small>когда вы тратите</small></h2>' + habitsHtml(list) + '</div>';
  h += '<div class="card"><h2>Сравнение периодов ' + (P.mode === 'all' ? '' : '<span class="toggle"><button data-cm="prev" class="' + (cmpMode === 'prev' ? 'on' : '') + '">с прошлым</button><button data-cm="year" class="' + (cmpMode === 'year' ? 'on' : '') + '">год назад</button></span>') + '</h2>' + cmpHtml(r, list) + '</div>';
  h += '</div>';
  $('#v-insights').innerHTML = h;
  $$('#v-insights [data-tb]').forEach(function(b){ b.onclick = function(){ topBy = b.dataset.tb; M.render(); }; });
  $$('#v-insights [data-cm]').forEach(function(b){ b.onclick = function(){ cmpMode = b.dataset.cm; M.render(); }; });
  $$('#v-insights [data-merch]').forEach(function(b){ b.onclick = function(){ merchSheet(b.dataset.merch, b.dataset.scope === 'all' ? S().tx : list, b.dataset.scope === 'all' ? 'Вся история' : M.label(P.mode, P.anchor)); }; });
  $$('#v-insights [data-hc]').forEach(function(b){ b.onclick = function(){ var p = b.dataset.hc.split('|'); $('#heatInfo').innerHTML = '<b>' + M.WD[+p[0]] + ', ' + HB[+p[1]] + '</b>: ' + rub0(+p[2]) + ' · ' + p[3] + ' покупок'; }; });
  $$('#v-insights [data-go-day]').forEach(function(b){ b.onclick = function(){ P.mode = 'day'; P.anchor = b.dataset.goDay; P.view = 'overview'; M.render(); window.scrollTo(0, 0); }; });
  habitsChart(list);
};
function merchStats(list){
  var m = {};
  list.forEach(function(t){ if (t.kind !== 'purchase') return; var x = m[t.merchant] = m[t.merchant] || { k: t.merchant, v: 0, n: 0, cat: t.cat }; x.v += t.spend; x.n++; });
  return Object.keys(m).map(function(k){ return m[k]; });
}
function recap(r, list, spend){
  var buys = list.filter(function(t){ return t.kind === 'purchase'; });
  if (!buys.length) return '<div class="card"><p class="muted">За этот период покупок нет.</p></div>';
  var days = {}; list.forEach(function(t){ if (t.spend) days[t.date] = (days[t.date] || 0) + t.spend; });
  var dk = Object.keys(days), topDay = dk.sort(function(a, b){ return days[b] - days[a]; })[0];
  var big = buys.slice().sort(function(a, b){ return b.spend - a.spend; })[0];
  var ms = merchStats(list), freq = ms.slice().sort(function(a, b){ return b.n - a.n; })[0];
  var cats = M.byCat(list), lead = cats[0];
  var cnt = function(c){ return list.filter(function(t){ return t.cat === c && t.kind === 'purchase'; }); };
  var sc = cnt('Самокаты'), tx = cnt('Такси');
  var a = r.s > M.dataMin() ? r.s : M.dataMin(), b = r.e < M.dataMax() ? r.e : M.dataMax();
  var total = Math.round((M.parseD(b) - M.parseD(a)) / 864e5) + 1, zero = Math.max(0, total - dk.length);
  var slides = [
    ['#141413', 'Всего на покупки', rub0(spend), buys.length + ' покупок · в среднем ' + rub0(spend / Math.max(1, total)) + ' в день'],
    ['#8a5a44', 'Самый дорогой день', rub0(days[topDay]), M.fmtD(topDay) + ' — нажмите, чтобы открыть', topDay],
    ['#3f5f8a', 'Самая крупная покупка', rub0(big.spend), esc(big.merchant) + ', ' + M.fmtD(big.date)],
    ['#5b7f5e', 'Чаще всего', esc(freq.k), freq.n + ' раз · ' + rub0(freq.v)],
    [M.color(lead.cat), 'Главная категория', esc(lead.cat), rub0(lead.v) + ' · ' + pct(lead.v, spend) + ' всех трат']
  ];
  if (sc.length) slides.push(['#6e8fb5', 'Самокаты', sc.length + ' поездок', rub0(M.sumSpend(sc)) + ' · в среднем ' + rub0(M.sumSpend(sc) / sc.length)]);
  if (tx.length) slides.push(['#5a6f9e', 'Такси', tx.length + ' поездок', rub0(M.sumSpend(tx)) + ' · в среднем ' + rub0(M.sumSpend(tx) / tx.length)]);
  if (total > 1) slides.push(['#7c8c99', 'Дни без покупок', zero + ' из ' + total, zero ? 'Каждый такой день — экономия' : 'Покупки были каждый день']);
  return '<div class="carousel">' + slides.map(function(s){ return '<div class="slide" style="background:' + s[0] + '"' + (s[4] ? ' data-go-day="' + s[4] + '" role="button"' : '') + '><div class="k">' + s[1] + '</div><div class="v">' + s[2] + '</div><div class="d">' + s[3] + '</div></div>'; }).join('') + '</div><p class="muted" style="margin:0;text-align:center">листайте карточки →</p>';
}
function median(a){ var b = a.slice().sort(function(x, y){ return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
var NOT_SUB = /Самокаты|Такси|Каршеринг|Продукты|Кафе|Алкоголь|Транспорт|Зарядки|Покупки|Прочие/;
function detectSubs(){
  var g = {};
  S().tx.forEach(function(t){ if (t.kind !== 'purchase') return; var k = t.merchant + '|' + Math.round(-t.amount); (g[k] = g[k] || []).push(t); });
  var out = [];
  Object.keys(g).forEach(function(k){
    var ops = g[k].sort(function(a, b){ return a.date < b.date ? -1 : 1; });
    var months = {}; ops.forEach(function(t){ months[t.date.slice(0, 7)] = 1; });
    var nm = Object.keys(months).length;
    var forced = ops.some(function(t){ return t.cat === 'Подписки'; });
    if (!forced && (NOT_SUB.test(ops[0].cat) || ops.length < 3 || nm < 3 || ops.length > nm * 1.3)) return;
    var gaps = []; for (var i = 1; i < ops.length; i++) gaps.push((M.parseD(ops[i].date) - M.parseD(ops[i - 1].date)) / 864e5);
    var mg = median(gaps);
    var kind = mg >= 25 && mg <= 35 ? 'month' : mg >= 6 && mg <= 8 ? 'week' : mg >= 350 && mg <= 380 ? 'year' : null;
    var reg = gaps.filter(function(g){ return kind === 'month' ? g >= 25 && g <= 35 : kind === 'week' ? g >= 6 && g <= 8 : g >= 350; }).length;
    if (!forced && (!kind || reg < gaps.length * 0.7)) return; // нерегулярно — значит, не подписка
    var amt = -ops[ops.length - 1].amount, last = ops[ops.length - 1].date;
    var nx = M.parseD(last); nx.setDate(nx.getDate() + Math.round(kind === 'week' ? 7 : kind === 'year' ? 365 : mg || 30));
    var perMonth = kind === 'week' ? amt * 52 / 12 : kind === 'year' ? amt / 12 : amt;
    out.push({ k: ops[0].merchant, amt: amt, kind: kind || 'month', n: ops.length, last: last, next: M.ymd(nx), perMonth: perMonth, cat: ops[0].cat, active: (M.parseD(M.dataMax()) - M.parseD(last)) / 864e5 < (kind === 'week' ? 15 : 45) });
  });
  return out.sort(function(a, b){ return (b.active - a.active) || b.perMonth - a.perMonth; });
}
function subsHtml(){
  var subs = detectSubs();
  if (!subs.length) return '<p class="muted">Регулярных платежей с одинаковой суммой не нашёл. Отметьте платёж категорией «Подписки» — и он появится здесь.</p>';
  var act = subs.filter(function(s){ return s.active; }), pm = act.reduce(function(s, x){ return s + x.perMonth; }, 0);
  var per = { month: 'раз в месяц', week: 'раз в неделю', year: 'раз в год' };
  return '<div class="grid kpis" style="margin-bottom:8px"><div class="card"><div class="muted">Активные в месяц</div><b style="font-size:20px">' + rub0(pm) + '</b></div><div class="card"><div class="muted">В год</div><b style="font-size:20px">' + rub0(pm * 12) + '</b></div></div><div class="rows">' +
    subs.map(function(s){ return '<button class="row" data-merch="' + esc(s.k) + '" data-scope="all"' + (s.active ? '' : ' style="opacity:.55"') + '><span class="dot" style="background:' + M.color(s.cat) + '"></span><span class="name">' + esc(s.k) + '</span><span class="amt">' + rub0(s.amt) + '</span><span class="meta">' + per[s.kind] + ' · ' + s.n + ' ' + plur(s.n, 'списание', 'списания', 'списаний') + ' · ' + (s.active ? 'следующее ≈ ' + M.fmtD(s.next) : 'похоже, отключено — последнее ' + M.fmtD(s.last)) + '</span></button>'; }).join('') + '</div><div class="note">Ищу платежи с одинаковой суммой в одном месте раз в неделю, месяц или год. Дата следующего списания — примерная.</div>';
}
function topHtml(r, list, spend){
  var ms = merchStats(list).sort(function(a, b){ return topBy === 'n' ? b.n - a.n || b.v - a.v : b.v - a.v; }).slice(0, 12);
  if (!ms.length) return '<p class="muted">Покупок нет.</p>';
  var a = r.s > M.dataMin() ? r.s : M.dataMin(), b = r.e < M.dataMax() ? r.e : M.dataMax();
  var weeks = Math.max(1, ((M.parseD(b) - M.parseD(a)) / 864e5 + 1) / 7), max = topBy === 'n' ? ms[0].n : ms[0].v;
  return '<div class="rows">' + ms.map(function(m, i){ var f = m.n / weeks; return '<button class="row" data-merch="' + esc(m.k) + '"><span class="muted" style="width:18px">' + (i + 1) + '</span><span class="name">' + esc(m.k) + '</span><span class="amt">' + (topBy === 'n' ? m.n + ' раз' : rub0(m.v)) + '</span><span class="meta"><span class="bar"><i style="width:' + Math.max(2, (topBy === 'n' ? m.n : m.v) / max * 100) + '%;background:' + M.color(m.cat) + '"></i></span>' + (topBy === 'n' ? rub0(m.v) : m.n + ' раз') + ' · чек ' + rub0(m.v / m.n) + (weeks >= 2 ? ' · ' + (f >= 1 ? f.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' в неделю' : 'раз в ' + Math.round(1 / f) + ' нед.') : '') + '</span></button>'; }).join('') + '</div>';
}
function merchSheet(k, list, lbl){
  var ops = list.filter(function(t){ return t.merchant === k && t.spend; }).sort(function(a, b){ return (b.date + b.time).localeCompare(a.date + a.time); }), tot = M.sumSpend(ops);
  M.sheet('<h3>' + esc(k) + '</h3><p class="muted">' + esc(lbl) + ' · ' + ops.length + ' операций · ' + rub0(tot) + ' · средний чек ' + rub0(tot / Math.max(1, ops.length)) + '</p><div class="rows" id="mOps">' + ops.slice(0, 60).map(function(t){ return M.opRow(t).replace('<span class="meta">', '<span class="meta">' + M.fmtD(t.date) + ', '); }).join('') + '</div>');
  $$('#mOps [data-op]').forEach(function(b){ b.onclick = function(){ M.opSheet(b.dataset.op); }; });
}
var HB = ['0–3 ч','3–6 ч','6–9 ч','9–12 ч','12–15 ч','15–18 ч','18–21 ч','21–24 ч'];
function habitsHtml(list){
  var buys = list.filter(function(t){ return t.kind === 'purchase'; });
  if (buys.length < 3) return '<p class="muted">Слишком мало покупок за период — выберите месяц или год.</p>';
  var grid = [], cnt = [], wd = [0,0,0,0,0,0,0], max = 0, best = null;
  for (var i = 0; i < 7; i++){ grid.push([0,0,0,0,0,0,0,0]); cnt.push([0,0,0,0,0,0,0,0]); }
  buys.forEach(function(t){ var d = (M.parseD(t.date).getDay() + 6) % 7, h = Math.min(7, Math.floor(+t.time.slice(0, 2) / 3)); grid[d][h] += t.spend; cnt[d][h]++; wd[d] += t.spend; });
  grid.forEach(function(row, d){ row.forEach(function(v, h){ if (v > max){ max = v; best = [d, h]; } }); });
  var wmax = wd.indexOf(Math.max.apply(null, wd));
  var hh = '<p style="margin:0 0 10px">Больше всего вы тратите <b>' + ['в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу','в воскресенье'][wmax] + '</b>, а пик — <b>' + M.WD[best[0]].toLowerCase() + ', ' + HB[best[1]] + '</b> (' + rub0(max) + ' за период).</p>';
  hh += '<div class="chartbox" style="height:150px"><canvas id="cWd"></canvas></div><div class="heat" style="margin-top:12px"><span></span>' + HB.map(function(x){ return '<span>' + x.split('–')[0] + '</span>'; }).join('');
  grid.forEach(function(row, d){ hh += '<span>' + M.WD[d] + '</span>' + row.map(function(v, h){ var a = max ? v / max : 0; return '<i data-hc="' + d + '|' + h + '|' + Math.round(v) + '|' + cnt[d][h] + '" style="background:' + (v ? 'rgba(20,20,19,' + (0.07 + a * 0.85).toFixed(2) + ')' : '#efece5') + '" role="button" aria-label="' + M.WD[d] + ' ' + HB[h] + ': ' + rub0(v) + '"></i>'; }).join(''); });
  return hh + '</div><div class="note" id="heatInfo">Чем темнее клетка, тем больше трат в это время. Нажмите на клетку.</div>';
}
function habitsChart(list){
  if (!$('#cWd')) return;
  var wd = [0,0,0,0,0,0,0]; list.forEach(function(t){ if (t.kind === 'purchase') wd[(M.parseD(t.date).getDay() + 6) % 7] += t.spend; });
  var mx = Math.max.apply(null, wd);
  M.chart('cWd', { type: 'bar', data: { labels: M.WD, datasets: [{ data: wd.map(Math.round), backgroundColor: wd.map(function(v){ return v === mx ? '#141413' : '#cfcabf'; }), borderRadius: 6, maxBarThickness: 30 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false } }, y: { display: false } }, plugins: { tooltip: Object.assign(M.tipStyle(), { callbacks: { label: function(i){ return rub0(i.raw); } } }) } } });
}
function plur(n, a, b, c){ var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
function cmpHtml(r, list){
  if (P.mode === 'all') return '<p class="muted">Выберите день, неделю, месяц или год — сравню с предыдущим.</p>';
  var anchorB = cmpMode === 'year' ? (function(){ var d = M.parseD(P.anchor); d.setFullYear(d.getFullYear() - 1); return M.ymd(d); })() : M.shift(P.mode, P.anchor, -1);
  var rb = M.range(P.mode, anchorB);
  if (M.coverage(rb) === 'none') return '<p class="muted">За ' + esc(M.label(P.mode, anchorB)) + ' данных нет. Загрузите более старую выписку или переключите сравнение.</p>';
  var A = {}, B = {}, lb = M.inR(rb);
  M.byCat(list).forEach(function(c){ A[c.cat] = c.v; }); M.byCat(lb).forEach(function(c){ B[c.cat] = c.v; });
  var cats = Object.keys(Object.assign({}, A, B)).sort(function(x, y){ return Math.max(A[y] || 0, B[y] || 0) - Math.max(A[x] || 0, B[x] || 0); }).slice(0, 12);
  var max = cats.reduce(function(m, c){ return Math.max(m, A[c] || 0, B[c] || 0); }, 1);
  var ta = M.sumSpend(list), tb = M.sumSpend(lb), d = ta - tb;
  var partial = M.coverage(rb) !== 'full' || M.coverage(r) !== 'full';
  var h = '<p style="margin:0 0 10px"><b>' + esc(M.label(P.mode, P.anchor)) + '</b>: ' + rub0(ta) + ' · <b>' + esc(M.label(P.mode, anchorB)) + '</b>: ' + rub0(tb) + '<br><span class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ больше на ' : '▼ меньше на ') + rub0(Math.abs(d)) + (tb ? ' (' + pct(Math.abs(d), tb) + ')' : '') + '</span></p>' + (partial ? '<div class="note" style="margin-bottom:10px">Внимание: выписка покрывает один из периодов не целиком, сравнение неточное.</div>' : '');
  h += '<div class="cmp-row" style="font-size:11px;color:var(--ink3)"><span style="text-align:right">' + esc(M.label(P.mode, anchorB)) + '</span><span></span><span>' + esc(M.label(P.mode, P.anchor)) + '</span></div>';
  h += cats.map(function(c){ var a = A[c] || 0, b = B[c] || 0, dd = a - b; return '<div class="cmp-row"><span class="l"><b style="width:' + (b / max * 100) + '%;background:#cfcabf"></b></span><span class="c">' + esc(c) + '<br><span class="' + (dd > 0 ? 'up' : 'down') + '">' + (dd > 0 ? '+' : '−') + rub0(Math.abs(dd)) + '</span></span><span><b style="width:' + (a / max * 100) + '%;background:' + M.color(c) + '"></b></span></div>'; }).join('');
  return h;
}

/* ================= Настройки категорий (в «Выписках») ================= */
var baseData = M.VIEWS.data;
M.VIEWS.data = function(){
  baseData();
  var custom = S().customCats;
  var cats = M.catNames();
  var card = '<div class="card stack" id="catCard"><h2>Категории и цвета <small>нажмите, чтобы сменить цвет</small></h2><div class="chips" style="flex-wrap:wrap">' +
    cats.map(function(c){ return '<button class="chip" data-cc="' + esc(c) + '"><span class="dot" style="background:' + M.color(c) + '"></span>' + esc(c) + '</button>'; }).join('') + '</div>' +
    '<div class="stack"><input id="ncName" type="text" maxlength="30" placeholder="Новая категория, например «Работа»"><div class="colors" id="ncCol">' + PALETTE.map(function(p, i){ return '<button data-pc="' + p + '" class="' + (i === 0 ? 'on' : '') + '" style="background:' + p + '" aria-label="Цвет ' + (i + 1) + '"></button>'; }).join('') + '</div><button class="btn ghost" id="ncAdd">Добавить категорию</button></div>' +
    '<p class="muted" style="margin:0">Чтобы отнести операцию к новой категории, откройте её во вкладке «Операции».</p></div>' +
    '<div class="card"><h2>Другие банки</h2><p class="muted" style="margin:0">Сейчас читаются PDF-выписки Т-Банка. Чтобы добавить Сбербанк или другой банк, нужен пример его выписки — пришлите её в чат, и я добавлю формат.</p></div>';
  var grid = $('#v-data .grid'); var tmp = document.createElement('div'); tmp.innerHTML = card;
  var anchor = grid.children[2] || null;
  while (tmp.firstChild) grid.insertBefore(tmp.firstChild, anchor);
  var pick = PALETTE[0];
  $$('#ncCol [data-pc]').forEach(function(b){ b.onclick = function(){ pick = b.dataset.pc; $$('#ncCol [data-pc]').forEach(function(x){ x.classList.toggle('on', x === b); }); }; });
  $('#ncAdd').onclick = function(){ var n = $('#ncName').value.trim(); if (!n) return M.toast('Введите название'); if (cats.indexOf(n) >= 0) return M.toast('Такая категория уже есть'); custom.push({ name: n, color: pick }); M.save(); M.render(); M.toast('Категория «' + n + '» добавлена'); };
  $$('#catCard [data-cc]').forEach(function(b){ b.onclick = function(){ colorSheet(b.dataset.cc); }; });
};
function colorSheet(cat){
  var isCustom = S().customCats.some(function(x){ return x.name === cat; });
  M.sheet('<h3><span class="dot" style="background:' + M.color(cat) + '"></span> ' + esc(cat) + '</h3><p class="muted">Выберите цвет — он поменяется на всех графиках.</p><div class="colors" style="margin:12px 0">' + PALETTE.map(function(p){ return '<button data-sc="' + p + '" class="' + (M.color(cat) === p ? 'on' : '') + '" style="background:' + p + '"></button>'; }).join('') + '</div>' +
    '<div class="stack">' + (S().catColors[cat] ? '<button class="btn ghost" id="ccReset">Вернуть исходный цвет</button>' : '') + (isCustom ? '<button class="btn danger" id="ccDel">Удалить категорию</button>' : '') + '</div>');
  $$('[data-sc]').forEach(function(b){ b.onclick = function(){ var u = S().customCats.filter(function(x){ return x.name === cat; })[0]; if (u) u.color = b.dataset.sc; else S().catColors[cat] = b.dataset.sc; M.save(); M.closeSheet(); M.render(); }; });
  var rs = $('#ccReset'); if (rs) rs.onclick = function(){ delete S().catColors[cat]; M.save(); M.closeSheet(); M.render(); };
  var dl = $('#ccDel'); if (dl) dl.onclick = function(){
    var st = S(); st.customCats = st.customCats.filter(function(x){ return x.name !== cat; });
    Object.keys(st.rules).forEach(function(k){ if (st.rules[k] === cat) delete st.rules[k]; });
    Object.keys(st.overrides).forEach(function(k){ if (st.overrides[k] === cat) delete st.overrides[k]; });
    delete st.limits[cat]; st.tx.forEach(M.enrich); M.save(); M.closeSheet(); M.render(); M.toast('Категория удалена');
  };
}
})();
