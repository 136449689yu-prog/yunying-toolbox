/* SmartPark 工作台：数据请求 + 手写 SVG 图表 */
const $ = (s) => document.querySelector(s);
const fmt = (n) => '¥' + Number(n).toLocaleString('zh-CN', {maximumFractionDigits: 0});
const fmt1 = (n) => '¥' + Number(n).toLocaleString('zh-CN', {maximumFractionDigits: 1});
const shortDay = (d) => d.slice(5).replace('-', '/');
// Vercel / Geist 语义色阶：蓝、绿、琥珀、紫、青、红
const COLORS = ['#0070f3', '#17c964', '#f5a623', '#7928ca', '#00b8d9', '#ee0000'];
let state = { equipment: [], repairs: [], revenueMode: 'daily', daily: [], monthly: [], spaceHour: new Date().getHours() };

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({detail: '请求失败'}));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}
const post = (path, body) => api(path, {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
});
const patch = (path, body) => api(path, {
  method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
});

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ---------- SVG 图表 ---------- */
function lineChart(el, points, opts = {}) {
  const w = opts.width || 720, h = opts.height || 230;
  const pad = {l: 56, r: 16, t: 16, b: 30};
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  if (!points.length) { el.innerHTML = '<p class="subtitle">暂无数据</p>'; return; }
  const vals = points.map(p => p.v);
  const max = Math.max(...vals, 1) * 1.15, min = 0;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : i * iw / (points.length - 1));
  const y = (v) => pad.t + ih - (v - min) / (max - min) * ih;
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + ih * i / 4;
    grid += `<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}"/>`;
    grid += `<text class="axis-text" x="${pad.l - 8}" y="${gy + 3}" text-anchor="end">${Math.round(max * (4 - i) / 4 / 1000)}k</text>`;
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = d + ` L${x(points.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z`;
  const step = Math.max(1, Math.ceil(points.length / 8));
  let labels = '';
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1)
      labels += `<text class="axis-text" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${p.label}</text>`;
  });
  let dots = '';
  points.forEach((p, i) => {
    if (points.length <= 16 || i % step === 0 || i === points.length - 1)
      dots += `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="${opts.color || COLORS[0]}"><title>${p.label}：${fmt1(p.v)}</title></circle>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img">${grid}
    <path d="${area}" fill="${opts.color || COLORS[0]}" opacity="0.07"/>
    <path class="line-path" d="${d}" stroke="${opts.color || COLORS[0]}"/>
    ${dots}${labels}</svg>`;
}

function donutChart(el, items, opts = {}) {
  const total = items.reduce((s, i) => s + i.v, 0) || 1;
  const cx = 110, cy = 110, r = 76, sw = 26, w = 220, h = 220;
  let acc = 0;
  let arcs = '';
  items.forEach((it, i) => {
    const color = it.color || COLORS[i % COLORS.length];
    const tip = opts.unit ? `${it.v}${opts.unit}` : fmt1(it.v);
    const frac = it.v / total;
    const a0 = acc * Math.PI * 2 - Math.PI / 2;
    acc += frac;
    const a1 = acc * Math.PI * 2 - Math.PI / 2;
    const large = frac > .5 ? 1 : 0;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    if (frac >= 0.9999) {
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"><title>${it.label}：${tip}</title></circle>`;
    } else {
      arcs += `<path d="M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt"><title>${it.label}：${tip}</title></path>`;
    }
  });
  const center = opts.center || fmt(total);
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img">${arcs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="12" fill="#888888">${opts.centerLabel || '合计'}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="19" font-weight="600" fill="#171717">${center}</text></svg>`;
}

function barChart(el, items, opts = {}) {
  const w = opts.width || 720, h = opts.height || 200;
  const pad = {l: 66, r: 18, t: 12, b: 30};
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...items.map(i => i.v), 1) * 1.12;
  const rowH = ih / items.length;
  const barH = Math.min(22, rowH * .5);
  const label = (v) => opts.suffix ? Number(v).toFixed(opts.decimals ?? 0) + opts.suffix : fmt(v);
  const tip = (v) => opts.suffix ? Number(v).toFixed(1) + opts.suffix : fmt1(v);
  let rows = '';
  items.forEach((it, i) => {
    const cy = pad.t + rowH * i + rowH / 2;
    const bw = it.v / max * iw;
    rows += `<text class="axis-text" x="${pad.l - 10}" y="${cy + 4}" text-anchor="end">${it.label}</text>`;
    rows += `<rect class="bar" x="${pad.l}" y="${cy - barH / 2}" width="${Math.max(bw, 2)}" height="${barH}" rx="${barH / 2}" fill="${it.color || COLORS[i % COLORS.length]}"><title>${it.label}：${tip(it.v)}</title></rect>`;
    rows += `<text class="axis-text" x="${pad.l + bw + 8}" y="${cy + 4}" fill="#4d4d4d">${label(it.v)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img">${rows}</svg>`;
}

function occupancyChart(el, rows) {
  if (!rows.length) { el.innerHTML = '<p class="subtitle">暂无数据</p>'; return; }
  const w = 900, h = 260, pad = {l: 46, r: 12, t: 20, b: 34};
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...rows.map(r => r.spaces), 1) * 1.05;
  const y = (v) => pad.t + ih - v / max * ih;
  const slot = iw / rows.length, bw = Math.min(26, slot * 0.62);
  const peak = Math.max(...rows.map(r => r.rate));
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + ih * i / 4;
    grid += `<line class="grid-line" x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}"/>`;
    grid += `<text class="axis-text" x="${pad.l - 8}" y="${gy + 3}" text-anchor="end">${Math.round(max * (4 - i) / 4)}</text>`;
  }
  let bars = '', labels = '';
  rows.forEach((r, i) => {
    const cx = pad.l + slot * (i + 0.5), x = cx - bw / 2;
    const yo = y(r.occupied), ys = y(r.spaces), y0 = y(0);
    const color = r.rate === peak ? COLORS[2] : COLORS[0];
    const tip = `${String(i).padStart(2, '0')}:00-${String((i + 1) % 24).padStart(2, '0')}:00｜占用 ${r.occupied} 位 · 空闲 ${r.free} 位 · 占用率 ${r.rate}%`;
    bars += `<rect x="${x.toFixed(1)}" y="${yo.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(y0 - yo, 0).toFixed(1)}" rx="2" fill="${color}"><title>${tip}</title></rect>`;
    bars += `<rect x="${x.toFixed(1)}" y="${ys.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(yo - ys, 0).toFixed(1)}" rx="2" fill="#ebebeb"><title>${tip}</title></rect>`;
    bars += `<text class="axis-text" x="${cx.toFixed(1)}" y="${(ys - 5).toFixed(1)}" text-anchor="middle">${Math.round(r.rate)}%</text>`;
    if (i % 2 === 0)
      labels += `<text class="axis-text" x="${cx.toFixed(1)}" y="${h - 10}" text-anchor="middle">${String(i).padStart(2, '0')}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img">${grid}${bars}${labels}</svg>`;
}

/* ---------- 概览 ---------- */
async function loadOverview() {
  const [k, daily, hours] = await Promise.all([
    api('/api/overview'), api('/api/revenue/daily?days=14'), api('/api/parking/occupancy?days=7')
  ]);
  const eq = k.equipment || {};
  const cards = [
    {label: '今日收入', value: fmt(k.revenue_today), foot: `今日订单 ${k.orders_today} 单`, color: COLORS[0],
     ic: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10.5h.01M6 13.5h.01M18 10.5h.01M18 13.5h.01"/></svg>'},
    {label: '本月收入', value: fmt(k.revenue_month), foot: '当月累计，随日期更新', color: COLORS[1],
     ic: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>'},
    {label: '设备在线率', value: Math.round((eq['正常'] || 0) / k.equipment_total * 100) + '%',
     foot: `共 ${k.equipment_total} 台 · 故障 ${eq['故障'] || 0} 台`, color: COLORS[2],
     ic: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 12h6M12 9v6"/></svg>'},
    {label: '未结报修', value: k.repair_open, foot: '待处理 + 处理中', color: COLORS[5],
     ic: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.8-.7-.7-2.8 2.8-2.8Z"/></svg>'},
  ];
  $('#kpi-grid').innerHTML = cards.map(c => `<div class="kpi"><div class="kpi-ic" style="color:${c.color};background:${c.color}1a">${c.ic}</div>
    <div class="label">${c.label}</div><div class="value">${c.value}</div><div class="foot">${c.foot}</div></div>`).join('');

  lineChart($('#chart-revenue-line'), daily.map(d => ({label: shortDay(d.day), v: d.amount})), {height: 230});
  const eqItems = [
    {label: '正常', v: eq['正常'] || 0, color: COLORS[1]},
    {label: '故障', v: eq['故障'] || 0, color: COLORS[5]},
    {label: '待保养', v: eq['待保养'] || 0, color: COLORS[2]},
  ].filter(i => i.v > 0);
  donutChart($('#chart-equipment-donut'), eqItems, {center: k.equipment_total + ' 台', unit: ' 台'});
  $('#equip-legend').innerHTML = eqItems.map((i, n) => `<div class="legend-row">
    <span class="legend-swatch" style="background:${i.color}"></span>
    <span class="name">${i.label}</span><span class="amount">${i.v} 台</span></div>`).join('');
  occupancyChart($('#chart-overview-parking'), hours);

  const todos = [
    {text: '设备故障待处理', num: eq['故障'] || 0, color: COLORS[5]},
    {text: '设备待保养', num: eq['待保养'] || 0, color: COLORS[2]},
    {text: '报修工单未结', num: k.repair_open, color: COLORS[0]},
  ];
  $('#todo-list').innerHTML = todos.map(t => `<div class="todo"><span class="todo-dot" style="background:${t.color}"></span>
    <span class="todo-text">${t.text}</span><span class="todo-num">${t.num}</span></div>`).join('');
}

/* ---------- 设施设备 ---------- */
const statusClass = s => s === '正常' ? 'ok' : s === '故障' ? 'fault' : 'maintain';
async function loadEquipment() {
  const params = new URLSearchParams();
  if (state.eqStatus) params.set('status', state.eqStatus);
  if (state.eqCat) params.set('category', state.eqCat);
  const [equipment, allEquipment] = await Promise.all([
    api('/api/equipment?' + params), api('/api/equipment'),
  ]);
  state.equipment = equipment;
  const cats = [...new Set(allEquipment.map(e => e.category))];
  $('#equipment-filter').innerHTML =
    chipGroup('状态', ['', '正常', '故障', '待保养'], state.eqStatus, 'eqStatus') +
    chipGroup('类别', ['', ...cats], state.eqCat, 'eqCat');
  bindChips();
  const rows = state.equipment.map(e => `<tr>
    <td>${e.code}</td><td>${e.name}</td><td>${e.category}</td>
    <td><span class="pill ${statusClass(e.status)}">${e.status}</span></td>
    <td>${e.last_check_on}</td><td>${e.note || '—'}</td>
    <td><select class="row-select" data-id="${e.id}" aria-label="修改状态">
      ${['正常', '故障', '待保养'].map(s => `<option ${s === e.status ? 'selected' : ''}>${s}</option>`).join('')}
    </select></td></tr>`).join('');
  $('#equipment-table').innerHTML = `<table><thead><tr>
    <th>编号</th><th>名称</th><th>类别</th><th>状态</th><th>最近巡检</th><th>备注</th><th>改状态</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" style="color:var(--muted)">没有符合条件的设备</td></tr>'}</tbody></table>`;
  // 重渲染后回到表格最左侧，避免编号列被裁切
  const card = $('#equipment-table').closest('.table-card');
  if (card) card.scrollLeft = 0;
  $('#equipment-table').querySelectorAll('.row-select').forEach(sel => {
    sel.onchange = async () => {
      try { await patch('/api/equipment/' + sel.dataset.id, {status: sel.value}); toast('设备状态已更新'); loadEquipment(); }
      catch (e) { toast(e.message); }
    };
  });
}

function chipGroup(label, values, current, key) {
  return `<span style="align-self:center;color:var(--muted);font-size:12px;margin-right:2px">${label}</span>` +
    values.map(v => `<button class="choice ${current === v ? 'active' : ''}" data-key="${key}" data-value="${v}">${v || '全部'}</button>`).join('');
}
function bindChips() {
  document.querySelectorAll('.choice').forEach(b => b.onclick = () => {
    state[b.dataset.key] = b.dataset.value;
    if (b.dataset.key.startsWith('eq')) loadEquipment(); else loadRepairs();
  });
}

/* ---------- 报修工单 ---------- */
const repairClass = s => s === '已完成' ? 'ok' : s === '处理中' ? 'blue' : 'fault';
async function loadRepairs() {
  const params = new URLSearchParams();
  if (state.repairStatus) params.set('status', state.repairStatus);
  state.repairs = await api('/api/repair?' + params);
  $('#repair-filter').innerHTML = chipGroup('状态', ['', '待处理', '处理中', '已完成'], state.repairStatus, 'repairStatus') +
    '<button class="btn" id="btn-new-repair" style="margin-left:auto">+ 新建报修</button>';
  bindChips();
  $('#btn-new-repair').onclick = openRepairModal;
  const rows = state.repairs.map(r => `<tr>
    <td>#${String(r.id).padStart(3, '0')}</td><td>${r.title}</td><td>${r.equipment_code || '—'}</td>
    <td><span class="pill ${r.priority === '高' ? 'red' : 'gray'}">${r.priority}</span></td>
    <td><span class="pill ${repairClass(r.status)}">${r.status}</span></td>
    <td>${r.reporter}</td><td>${r.created_on}</td><td>${r.resolved_on || '—'}</td>
    <td><button class="link-btn" data-id="${r.id}" data-status="${r.status}">推进状态</button></td></tr>`).join('');
  $('#repair-table').innerHTML = `<table><thead><tr>
    <th>单号</th><th>问题</th><th>设备编号</th><th>优先级</th><th>状态</th><th>报修人</th>
    <th>报修日期</th><th>完成日期</th><th>操作</th></tr></thead><tbody>
    ${rows || '<tr><td colspan="9" style="color:var(--muted)">没有符合条件的工单</td></tr>'}</tbody></table>`;
  $('#repair-table').querySelectorAll('.link-btn').forEach(b => b.onclick = () => cycleRepair(b));
}

async function cycleRepair(btn) {
  const next = {'待处理': '处理中', '处理中': '已完成', '已完成': '待处理'}[btn.dataset.status];
  try { await patch('/api/repair/' + btn.dataset.id, {status: next}); toast('工单状态：' + next); loadRepairs(); }
  catch (e) { toast(e.message); }
}

function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal-wrap').classList.remove('hidden');
}
function closeModal() { $('#modal-wrap').classList.add('hidden'); }
$('#modal-close').onclick = closeModal;
$('#modal-wrap').onclick = e => { if (e.target.id === 'modal-wrap') closeModal(); };

async function openRepairModal() {
  if (!state.allEquipment) state.allEquipment = await api('/api/equipment');
  const opts = state.allEquipment.map(e => `<option value="${e.id}">${e.code} · ${e.name}（${e.status}）</option>`).join('');
  openModal('新建报修工单', `
    <div class="field"><label>报修设备</label><select id="f-equipment">${opts}</select></div>
    <div class="field"><label>问题描述</label><input id="f-title" placeholder="例如：道闸起杆卡顿"></div>
    <div class="field"><label>优先级</label><select id="f-priority"><option>中</option><option>高</option><option>低</option></select></div>
    <div class="field"><label>报修人</label><input id="f-reporter" value="值班员"></div>
    <div class="modal-actions"><button class="btn ghost" id="f-cancel">取消</button><button class="btn" id="f-submit">提交</button></div>`);
  $('#f-cancel').onclick = closeModal;
  $('#f-submit').onclick = async () => {
    const body = {
      equipment_id: Number($('#f-equipment').value), title: $('#f-title').value.trim(),
      priority: $('#f-priority').value, reporter: $('#f-reporter').value.trim() || '值班员'
    };
    if (!body.title) { toast('请填写问题描述'); return; }
    try { await post('/api/repair', body); closeModal(); toast('报修已登记'); loadRepairs(); }
    catch (e) { toast(e.message); }
  };
}

/* ---------- 收入分析 ---------- */
async function loadRevenue() {
  if (!state.daily.length) {
    [state.daily, state.monthly] = await Promise.all([api('/api/revenue/daily?days=90'), api('/api/revenue/monthly')]);
  }
  const sources = await api('/api/revenue/sources');
  const isDaily = state.revenueMode === 'daily';
  const series = (isDaily ? state.daily : state.monthly).map(d => ({
    label: isDaily ? shortDay(d.day) : d.month.slice(2), v: d.amount
  }));
  $('#trend-title').textContent = isDaily ? '近 90 天每日收入' : '各月份收入';
  $('#trend-tag').textContent = '单位：元';
  lineChart($('#chart-trend'), series, {height: 270, color: isDaily ? COLORS[0] : COLORS[1]});

  donutChart($('#chart-source-donut'), sources.map(s => ({label: s.source, v: s.amount})));
  $('#source-legend').innerHTML = sources.map((s, i) => `<div class="legend-row">
    <span class="legend-swatch" style="background:${COLORS[i % COLORS.length]}"></span>
    <span class="name">${s.source}</span><span class="amount">${fmt(s.amount)}</span></div>`).join('');

  barChart($('#chart-source-orders'), sources.map(s => ({label: s.source, v: s.orders})),
    {height: 190, suffix: ' 单', decimals: 0});
  const total = sources.reduce((s, x) => s + x.amount, 0);
  const orders = sources.reduce((s, x) => s + x.orders, 0);
  const stats = [
    ['累计收入', fmt(total)], ['累计订单', orders.toLocaleString('zh-CN') + ' 单'],
    ['平均客单价', fmt(total / orders)], ['收入最高来源', sources[0]?.source || '—']
  ];
  $('#revenue-stats').innerHTML = stats.map(s => `<div class="stat"><span class="k">${s[0]}</span><span class="v">${s[1]}</span></div>`).join('');
}

/* ---------- 车位使用 ---------- */
async function loadParking() {
  const [turnover, hours] = await Promise.all([
    api('/api/parking/turnover?days=30'),
    api('/api/parking/occupancy?days=7'),
  ]);
  const lot = turnover[0] || {lot: '停车场', spaces: 0, orders: 0, turnover: 0};
  const spaces = lot.spaces, orders = lot.orders;
  const peak = hours.reduce((a, b) => b.rate > a.rate ? b : a, hours[0]);
  const low = hours.reduce((a, b) => b.rate < a.rate ? b : a, hours[0]);
  const avgRate = hours.reduce((s, h) => s + h.rate, 0) / hours.length;
  const avgOccupied = hours.reduce((s, h) => s + h.occupied, 0) / hours.length;
  const avgFree = hours.reduce((s, h) => s + h.free, 0) / hours.length;
  const hourText = (h) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;

  const cards = [
    {label: '日均车位周转率', value: lot.turnover.toFixed(2) + ' 次/日', foot: `近 30 日 ${orders.toLocaleString('zh-CN')} 单 / ${spaces} 位`, color: COLORS[0],
     ic: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>'},
    {label: '峰值占用率', value: peak.rate + '%', foot: `${hourText(peak.hour)} · ${Math.round(peak.occupied)} 位在用`, color: COLORS[2],
     ic: '<svg viewBox="0 0 24 24"><path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14l3.5-3.5"/></svg>'},
    {label: '最低占用率', value: low.rate + '%', foot: hourText(low.hour), color: COLORS[4],
     ic: '<svg viewBox="0 0 24 24"><path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14 8.5 11"/></svg>'},
    {label: '平均空闲车位', value: Math.round(avgFree) + ' 位', foot: `近 7 日逐小时平均 · 占用率 ${avgRate.toFixed(1)}%`, color: COLORS[1],
     ic: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>'},
  ];
  $('#parking-kpi').innerHTML = cards.map(c => `<div class="kpi"><div class="kpi-ic" style="color:${c.color};background:${c.color}1a">${c.ic}</div>
    <div class="label">${c.label}</div><div class="value">${c.value}</div><div class="foot">${c.foot}</div></div>`).join('');

  const useItems = [
    {label: '占用', v: Math.round(avgOccupied), color: COLORS[0]},
    {label: '空闲', v: Math.round(avgFree), color: '#ebebeb'},
  ];
  donutChart($('#chart-parking-donut'), useItems,
    {center: Math.round(avgOccupied) + ' 位', centerLabel: '平均在用', unit: ' 位'});
  $('#parking-donut-legend').innerHTML = useItems.map(i => `<div class="legend-row">
    <span class="legend-swatch" style="background:${i.color}"></span>
    <span class="name">${i.label}</span><span class="amount">${i.v} 位</span></div>`).join('');

  const stats = [
    ['停车场', lot.lot], ['车位总数', spaces + ' 位'],
    ['近 30 日订单', orders.toLocaleString('zh-CN') + ' 单'],
    ['日均订单', lot.avg_daily_orders + ' 单'],
  ];
  $('#parking-stats').innerHTML = stats.map(s => `<div class="stat"><span class="k">${s[0]}</span><span class="v">${s[1]}</span></div>`).join('');

  occupancyChart($('#chart-occupancy'), hours);
  const legend = [
    {label: '占用车位', color: COLORS[0]},
    {label: '空闲车位', color: '#ebebeb'},
    {label: '高峰时段', color: COLORS[2]},
  ];
  $('#occupancy-legend').innerHTML = legend.map(i => `<div class="legend-row">
    <span class="legend-swatch" style="background:${i.color}"></span><span class="name">${i.label}</span></div>`).join('');

  const hourStats = [
    ['占用高峰', hourText(peak.hour)],
    ['高峰占用率', peak.rate + '%'],
    ['高峰空闲', Math.round(peak.free) + ' 位'],
    ['最低占用', hourText(low.hour) + ' · ' + low.rate + '%'],
    ['平均占用率', avgRate.toFixed(1) + '%'],
  ];
  $('#parking-hour-stats').innerHTML = hourStats.map(s => `<div class="stat"><span class="k">${s[0]}</span><span class="v">${s[1]}</span></div>`).join('');

  const method = [
    ['周转率公式', '日均订单 ÷ 车位数'],
    ['统计周期', '近 30 日'],
    ['占用数据', '近 7 日同一时段平均'],
    ['数据性质', '演示数据，非实时'],
  ];
  $('#parking-method').innerHTML = method.map(s => `<div class="stat"><span class="k">${s[0]}</span><span class="v">${s[1]}</span></div>`).join('');
  await loadSpaces();
}

async function loadSpaces() {
  const sel = $('#space-hour');
  if (!sel.options.length) {
    for (let h = 0; h < 24; h++) sel.add(new Option(`${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`, h));
  }
  sel.value = state.spaceHour;
  const d = await api('/api/parking/spaces?hour=' + state.spaceHour);
  const rate = d.spaces ? (d.occupied / d.spaces * 100).toFixed(1) : '0.0';
  $('#space-day-tag').textContent = `${d.day} · ${sel.options[state.spaceHour].text}`;
  const freeRate = d.spaces ? (d.free / d.spaces * 100).toFixed(1) : '0.0';
  $('#space-summary').innerHTML = `占用 <b>${d.occupied}</b> · 空闲 <b>${d.free}</b> · 使用率 <b>${rate}%</b> · 空闲率 <b>${freeRate}%</b>`;
  $('#space-grid').innerHTML = d.items.map(i => `<div class="space ${i.occupied ? 'occupied' : 'free'}"
    title="${i.code}｜${i.occupied ? '占用' : '空闲'}｜当日使用 ${i.used_hours} 小时">
    <span class="no">${i.code}</span><span class="hours">${i.used_hours}h</span></div>`).join('');
  const legend = [
    {label: '占用', color: COLORS[0]},
    {label: '空闲', color: '#ebebeb'},
  ];
  $('#space-legend').innerHTML = legend.map(i => `<div class="legend-row">
    <span class="legend-swatch" style="background:${i.color}"></span><span class="name">${i.label}</span></div>`).join('');
}

/* ---------- 路由 ---------- */
const TITLES = {
  overview: ['运营概览', '设施设备与停车收入，一屏掌握'],
  equipment: ['设施设备', '台账、状态与巡检记录'],
  repair: ['报修工单', '登记问题，跟踪处理进度'],
  revenue: ['收入分析', '日 / 月趋势、来源构成与订单量'],
  parking: ['车位使用', '车位周转率与逐小时占用情况'],
};
async function show(view) {
  // 切换功能时回到顶部，避免沿用上一个功能的滚动位置导致标题被裁切
  window.scrollTo(0, 0);
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + view));
  $('#page-title').textContent = TITLES[view][0];
  $('#page-sub').textContent = TITLES[view][1];
  $('#top-actions').innerHTML = '';
  try {
    if (view === 'overview') await loadOverview();
    if (view === 'equipment') await loadEquipment();
    if (view === 'repair') await loadRepairs();
    if (view === 'revenue') await loadRevenue();
    if (view === 'parking') await loadParking();
  } catch (e) { toast(e.message); }
  if (window.__reportAppHeight) window.__reportAppHeight();
}
$('#nav').onclick = e => { const b = e.target.closest('.nav-item'); if (b) show(b.dataset.view); };
$('#revenue-mode').onclick = e => {
  const b = e.target.closest('.seg'); if (!b) return;
  state.revenueMode = b.dataset.mode;
  document.querySelectorAll('#revenue-mode .seg').forEach(s => s.classList.toggle('active', s === b));
  loadRevenue();
};
$('#space-hour').onchange = e => {
  state.spaceHour = Number(e.target.value);
  loadSpaces();
};
$('#today-label').textContent = new Date().toLocaleDateString('zh-CN', {year:'numeric', month:'long', day:'numeric'});
show('overview');
