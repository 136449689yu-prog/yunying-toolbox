const $ = (s) => document.querySelector(s);
let state = { collection: null, letters: [], letter_batch: null, settings: {}, audit: [] };

const money = (v) => "¥" + Number(v || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 });

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function msg(text, error = false) {
  const box = $("#import-msg");
  box.textContent = text;
  box.classList.toggle("error", error);
  box.hidden = !text;
  // 提示同时浮在右下角，停在哪一步都看得见
  let toast = document.getElementById("wb-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "wb-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.className = "wb-toast show" + (error ? " error" : "");
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => toast.classList.remove("show"), 3000);
}

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

function flags(text) {
  return String(text || "").split("、").filter(Boolean);
}

function renderCollection(s) {
  state.collection = s;
  const bar = $("#check-bar");
  bar.className = "check-bar " + (s.check_pass ? "ok" : "bad");
  $("#check-text").textContent = s.check_pass
    ? "合计校验通过，应收 − 减免 = 实欠"
    : "合计校验不通过，请检查数据";
  $("#check-formula").textContent = `${money(s.receivable_total)} − ${money(s.reduction_total)} = ${money(s.net_total)}`;
  $("#batch-tag").textContent = `批次 ${s.batch}`;

  const stats = [
    ["商户", String(s.merchant_count), ""],
    ["费项", String(s.row_count), ""],
    ["项目 / 费种", `${s.project_count} / ${s.fee_count}`, "small"],
    ["实欠合计", money(s.net_total), "small"],
  ];
  const box = $("#stats");
  box.replaceChildren();
  for (const [label, value, cls] of stats) {
    const card = el("div", "stat");
    card.append(el("div", "stat-label", label), el("div", "stat-value " + cls, value));
    box.append(card);
  }

  const colors = { 高: "#D64541", 中: "#E39B24", 低: "#2E8B57" };
  const lg = $("#level-grid");
  const dist = $("#dist-bar");
  lg.replaceChildren();
  dist.replaceChildren();
  for (const level of ["高", "中", "低"]) {
    const group = s.merchants.filter((m) => m.level === level);
    const sum = group.reduce((a, m) => a + Number(m.net_total), 0);
    const card = el("div", "level-card " + { 高: "high", 中: "mid", 低: "low" }[level]);
    card.append(el("div", "label", level + "优先级"), el("div", "num", String(group.length)), el("div", "sum", money(sum)));
    lg.append(card);
    const seg = el("span");
    seg.style.width = (group.length / Math.max(s.merchant_count, 1) * 100) + "%";
    seg.style.background = colors[level];
    dist.append(seg);
  }

  const body = $("#prio-body");
  body.replaceChildren();
  if (!s.merchants.length) {
    const td = el("td", "empty", "暂无数据，先载入模拟数据或导入表格");
    td.colSpan = 11;
    const tr = el("tr");
    tr.append(td);
    body.append(tr);
  }
  for (const m of s.merchants) {
    const tr = el("tr");
    const pickTd = el("td", "pick-col");
    const pick = el("input");
    pick.type = "checkbox";
    pick.className = "merchant-check";
    pick.checked = true;
    pick.dataset.merchant = m.merchant;
    pickTd.append(pick);
    tr.append(pickTd, el("td", "rank", String(m.rank)));
    const pill = el("td");
    pill.append(el("span", "level-pill " + m.level, m.level));
    tr.append(pill, el("td", "", m.merchant), el("td", "", `${m.project} · ${m.shop_no || "—"}`));
    tr.append(el("td", "num", money(m.net_total)), el("td", "num", m.age_days + " 天"));
    const riskTd = el("td");
    for (const f of flags(m.risk_flags)) riskTd.append(el("span", "risk-tag", f));
    tr.append(riskTd, el("td", "num score-cell", Number(m.score).toFixed(1)));

    const typeTd = el("td");
    const select = el("select", "type-select");
    for (const t of ["一次函", "二次函"]) {
      const opt = el("option", "", t);
      opt.value = t;
      select.append(opt);
    }
    select.value = m.level === "低" ? "一次函" : "二次函";
    select.dataset.merchant = m.merchant;
    typeTd.append(select);
    tr.append(typeTd);

    const caretTd = el("td");
    caretTd.append(el("span", "caret", "▸"));
    tr.append(caretTd);

    const detailTr = el("tr", "fee-detail");
    detailTr.hidden = true;
    const detailTd = el("td");
    detailTd.colSpan = 11;
    for (const item of s.items.filter((i) => i.merchant === m.merchant)) {
      const line = el("div", "bar-row");
      line.style.marginBottom = "4px";
      line.append(el("span", "", item.fee_item),
        el("span", "caption", `应收 ${money(item.receivable)} · 减免 ${money(item.reduction)}`),
        el("span", "num", money(item.net_amount)));
      line.lastChild.style.marginLeft = "auto";
      detailTd.append(line);
    }
    detailTr.append(detailTd);
    tr.addEventListener("click", (e) => {
      if (e.target.closest("input, select")) return;
      detailTr.hidden = !detailTr.hidden;
      caretTd.firstChild.classList.toggle("open", !detailTr.hidden);
    });
    body.append(tr, detailTr);
  }

  $("#s2").hidden = false;
  $("#s3").hidden = false;
  $("#s4").hidden = false;
  $("#s5").hidden = false;
  updatePickCount();
}

function selected() {
  return [...document.querySelectorAll(".merchant-check:checked")].map((n) => ({
    merchant: n.dataset.merchant,
    notice_type: document.querySelector(`.type-select[data-merchant="${CSS.escape(n.dataset.merchant)}"]`).value,
  }));
}

function updatePickCount() {
  const n = document.querySelectorAll(".merchant-check:checked").length;
  const all = document.querySelectorAll(".merchant-check").length;
  $("#pick-count").textContent = `已勾选 ${n} / ${all} 户，下面三项产出共用这份选择`;
  $("#pick-all").checked = n === all && all > 0;
}

function downloadLink(folder, name) {
  // 静态展示版：样例文件已挂在 files/ 下，直接指向文件路径，点开即下载。
  return `files/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
}

// 产物链接：新窗口打开并带下载属性，避免当前预览页被二进制文件顶成空白
function artifactLink(folder, name, label) {
  const a = el("a", "", label);
  a.href = downloadLink(folder, name);
  a.target = "_blank";
  a.rel = "noopener";
  a.download = name;
  return a;
}

function escHtml(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmtDate(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

function letterMerchant(letter) {
  const col = (state.collection) || {};
  const merchants = col.merchants || [];
  const items = (col.items || []).filter((i) => i.shop_no === letter.shop_no);
  const m = merchants.find((x) => x.shop_no === letter.shop_no) || null;
  return { m, items };
}

function renderLetters(letters, batch, zip) {
  $("#letter-batch").textContent = `批次 ${batch}`;
  $("#letter-summary").textContent = letters.length
    ? `已生成 ${letters.length} 份函件，每份可预览并下载 Word 和 PDF。`
    : "尚未出函，勾选商户后点右侧按钮生成。";
  const list = $("#letter-files");
  list.replaceChildren();
  for (const letter of letters) {
    const item = el("div", "file-item");
    item.append(el("span", "", `${letter.shop_no} · ${letter.notice_type}`));
    const links = el("span", "links");
    const prev = el("button", "preview-btn", "预览");
    prev.type = "button";
    prev.onclick = () => openLetterModal(letter, batch);
    links.append(prev);
    if (letter.docx_name) links.append(artifactLink(batch, letter.docx_name, "DOCX"));
    if (letter.pdf_name) links.append(artifactLink(batch, letter.pdf_name, "PDF"));
    item.append(links);
    list.append(item);
  }
  const zipLink = $("#letter-zip");
  zipLink.hidden = !zip;
  if (zip) {
    zipLink.href = downloadLink(batch, zip);
    zipLink.target = "_blank";
    zipLink.rel = "noopener";
    zipLink.download = zip;
  }
}

function openLetterModal(letter, batch) {
  const { m, items } = letterMerchant(letter);
  const settings = state.settings || {};
  const merchant = m ? m.merchant : letter.shop_no;
  const net = m ? money(m.net_total) : "—";
  const age = m ? `${m.age_days} 天` : "—";
  const flagList = flags(m ? m.risk_flags : "").join("、");
  const isFirst = letter.notice_type === "一次函";
  const dateText = fmtDate(letter.created_at) || fmtDate(state.collection && state.collection.created_at);

  const feeHtml = items.length
    ? items.map((it) => `<div class="fee"><span>${escHtml(it.fee_item)}</span><span class="meta">应收 ${money(it.receivable)} · 减免 ${money(it.reduction)}</span><span class="num">${money(it.net_amount)}</span></div>`).join("")
    : `<div class="fee"><span>${escHtml(merchant)}</span><span class="meta">欠费明细以台账为准</span><span class="num">${net}</span></div>`;

  const doc = $("#letter-doc");
  doc.innerHTML = `
    <div class="letter-title">${isFirst ? "催费通知书（第一次）" : "催费通知书（第二次）"}</div>
    <p class="letter-p"><span class="to">致：${escHtml(merchant)}（铺位 ${escHtml(letter.shop_no)}）</span></p>
    <p class="letter-p">${isFirst
      ? "现就贵方欠费事宜正式催告如下："
      : `我方已于此前就贵方欠费事宜发函催告，但截至 ${escHtml(dateText || "本函出具日")}，贵方仍未清偿。现再次正式催告如下：`}</p>
    <p class="letter-p">截至本函出具日，贵方尚欠最近 3 个月期间费用人民币 <strong>${net}</strong>，累计逾期 ${age}。</p>
    <div class="letter-fees">${feeHtml}</div>
    ${flagList ? `<p class="letter-p">我方已注意到：${escHtml(flagList)}。为避免损失扩大，请贵方予以高度重视。</p>` : ""}
    <p class="letter-p">请贵方于收到本函之日起 5 日内，将上述款项全额缴至：</p>
    <p class="letter-p">收款单位：${escHtml(settings.company || "—")}<br>开户银行：${escHtml(settings.bank || "—")}<br>账　　号：${escHtml(settings.account || "—")}</p>
    <p class="letter-p">缴款凭证请发送至 ${escHtml(settings.contact || "—")}（${escHtml(settings.phone || "—")}）。</p>
    <div class="letter-warn">本函送达后贵方仍不清偿的，我方将依据合同约定及法律规定，采取包括但不限于解除合同、收回场地、提起诉讼、申请财产保全等措施，并追索欠款本金、违约金、律师费及全部诉讼费用。</div>
    ${isFirst ? "" : `<p class="letter-p">本函为最后催告，请慎处。</p>`}
    <p class="letter-p">特此通知。</p>
    <div class="letter-sign">${escHtml(settings.company || "—")}<br>${escHtml(dateText || "")}</div>`;

  const docx = $("#letter-docx");
  const pdf = $("#letter-pdf");
  if (letter.docx_name) { docx.hidden = false; docx.href = downloadLink(batch, letter.docx_name); docx.download = letter.docx_name; docx.target = "_blank"; docx.rel = "noopener"; } else docx.hidden = true;
  if (letter.pdf_name) { pdf.hidden = false; pdf.href = downloadLink(batch, letter.pdf_name); pdf.download = letter.pdf_name; pdf.target = "_blank"; pdf.rel = "noopener"; } else pdf.hidden = true;

  $("#letter-modal").hidden = false;
}

function closeLetterModal() { $("#letter-modal").hidden = true; }

const AUDIT_CAP = 15;
let auditCache = [];
let auditFilter = "全部";
let auditQuery = "";
let auditExpanded = false;

const AUDIT_CAT_COLOR = {
  "归集": "#5E6AD2",
  "出函": "#8B5CF6",
  "诉讼": "#E24B4A",
  "月报": "#27A644",
  "其他": "#8A8F98",
};
function auditCategory(a) {
  const x = (a.action || "") + (a.detail || "");
  if (/归集|导入|上传/.test(x)) return "归集";
  if (/出函|函件|催费/.test(x)) return "出函";
  if (/诉讼|起诉|清单/.test(x)) return "诉讼";
  if (/月报|进展|统计/.test(x)) return "月报";
  return "其他";
}
function auditDay(iso) {
  const d = String(iso || "").slice(0, 10);
  const fmt = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (d === fmt(today)) return "今天";
  if (d === fmt(yest)) return "昨天";
  return d;
}
function auditTime(iso) { return String(iso || "").slice(0, 16).replace("T", " "); }

function renderAudit(audit) {
  auditCache = audit || [];
  auditFilter = "全部";
  auditQuery = "";
  auditExpanded = false;
  const search = $("#audit-search");
  if (search) search.value = "";
  renderAuditChips();
  drawAudit();
}

function renderAuditChips() {
  const box = $("#audit-chips");
  box.replaceChildren();
  const cats = ["全部", ...new Set(auditCache.map(auditCategory))];
  for (const c of cats) {
    const b = el("button", "chip" + (c === auditFilter ? " active" : ""), c);
    b.type = "button";
    b.onclick = () => { auditFilter = c; auditExpanded = false; renderAuditChips(); drawAudit(); };
    box.append(b);
  }
}

function drawAudit() {
  const box = $("#audit-list");
  box.replaceChildren();
  const q = auditQuery.trim().toLowerCase();
  const rows = auditCache.filter((a) => {
    if (auditFilter !== "全部" && auditCategory(a) !== auditFilter) return false;
    if (q && !(a.action + " " + (a.detail || "")).toLowerCase().includes(q)) return false;
    return true;
  }).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));

  const total = rows.length;
  const shown = auditExpanded ? rows : rows.slice(0, AUDIT_CAP);

  if (!total) {
    box.append(el("div", "caption", auditCache.length ? "没有匹配的操作记录" : "暂无操作记录"));
  } else {
    let lastDay = "";
    for (const a of shown) {
      const day = auditDay(a.created_at);
      if (day !== lastDay) { box.append(el("div", "audit-group-label", day)); lastDay = day; }
      const item = el("div", "audit-item");
      const dot = el("span", "dot");
      dot.style.background = AUDIT_CAT_COLOR[auditCategory(a)];
      item.append(dot,
        el("strong", "", auditTime(a.created_at)),
        el("span", "act", a.action),
        el("span", "", a.detail ? " · " + a.detail : ""));
      box.append(item);
    }
  }

  const foot = $("#audit-foot");
  foot.replaceChildren();
  foot.append(el("span", "audit-count", total ? `共 ${total} 条` : ""));
  if (total > AUDIT_CAP) {
    const btn = el("button", "btn-plain", auditExpanded ? "收起" : `展开全部 ${total} 条`);
    btn.type = "button";
    btn.onclick = () => { auditExpanded = !auditExpanded; drawAudit(); };
    foot.append(btn);
  }
}

$("#audit-search").addEventListener("input", (e) => {
  auditQuery = e.target.value;
  auditExpanded = false;
  drawAudit();
});

function renderLitigationLinks(rows) {
  const box = $("#litigation-files");
  box.replaceChildren();
  for (const r of rows) {
    const a = el("a", "output-link");
    a.href = downloadLink(r.folder, r.name);
    a.target = "_blank";
    a.rel = "noopener";
    a.download = r.name;
    a.append(el("span", "", r.label), el("span", "", "下载 ↗"));
    box.append(a);
  }
}

function renderMonthly(s, folder, name) {
  const cards = [
    ["统计月份", s.month], ["归集商户", String(s.merchant_count)],
    ["实欠合计", money(s.net_total)], ["已出催缴函", String(s.letter_count)],
    ["涉诉商户", String(s.litigation_count)], ["涉诉金额", money(s.litigation_amount)],
  ];
  const grid = $("#month-grid");
  grid.replaceChildren();
  for (const [label, value] of cards) {
    const card = el("div", "level-card");
    card.append(el("div", "label", label), el("div", "num", value));
    grid.append(card);
  }
  const bars = $("#month-levels");
  bars.replaceChildren();
  const max = Math.max(...s.levels.map((x) => x.amount), 1);
  for (const x of s.levels) {
    const row = el("div", "bar-row");
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = (x.amount / max * 100) + "%";
    fill.style.background = { 高: "#D64541", 中: "#E39B24", 低: "#2E8B57" }[x.level];
    track.append(fill);
    row.append(el("div", "bar-label", x.level + " · " + x.count + " 户"), track, el("div", "bar-value", money(x.amount)));
    bars.append(row);
  }
  const files = $("#monthly-files");
  files.replaceChildren();
  const link = el("a", "output-link");
  link.href = downloadLink(folder, name);
  link.target = "_blank";
  link.rel = "noopener";
  link.download = name;
  link.append(el("span", "", "月度清收进展 Excel（含项目、费项、风险信号分表）"), el("span", "", "下载 ↗"));
  files.append(link);
  $("#monthly-view").hidden = false;
}

async function loadState() {
  try {
    const d = await api("/api/workspace/state");
    state = d;
    if (d.collection) renderCollection(d.collection);
    renderLetters(d.letters || [], d.letter_batch, d.letter_batch ? `催费函_${d.letter_batch}.zip` : null);
    const af = d.artifacts || {};
    if (af.litigation && af.litigation.length) renderLitigationLinks(af.litigation);
    if (af.monthly && af.monthly.summary) {
      renderMonthly(af.monthly.summary, af.monthly.folder, af.monthly.name);
    }
    renderAudit(d.audit || []);
    for (const [key, value] of Object.entries(d.settings || {})) {
      const input = document.querySelector(`#settings-form [name="${key}"]`);
      if (input) input.value = value;
    }
  } catch (err) {
    msg("加载失败：" + err.message, true);
  }
}

$("#choose-files").addEventListener("click", () => $("#file-input").click());
function showChips(files) {
  const box = $("#file-chips");
  box.replaceChildren();
  for (const f of files) box.append(el("span", "file-chip", f.name));
}
$("#file-input").addEventListener("change", (e) => {
  const files = [...e.target.files];
  showChips(files);
  upload(files);
});
const zone = $("#drop-zone");
zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("drag-over");
  const files = [...e.dataTransfer.files];
  showChips(files);
  upload(files);
});

async function upload(files) {
  if (!files.length) return;
  msg("正在归集…");
  const form = new FormData();
  for (const f of files) form.append("files", f);
  try {
    const data = await api("/api/collection/import", { method: "POST", body: form });
    renderCollection(data.state);
    msg(`归集完成：${data.state.row_count} 条费项 → ${data.state.merchant_count} 商户`);
    await loadState();
  } catch (err) {
    msg("归集失败：" + err.message, true);
  }
}

$("#load-sample").addEventListener("click", async () => {
  const btn = $("#load-sample");
  btn.disabled = true;
  btn.textContent = "载入中…";
  try {
    const data = await api("/api/collection/load-sample", { method: "POST" });
    renderCollection(data.state);
    msg("模拟数据已载入：3 个项目、24 商户、32 条费项，分散在 5 张表");
    await loadState();
  } catch (err) {
    msg("载入失败：" + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "载入模拟数据";
  }
});

$("#pick-all").addEventListener("change", (e) => {
  document.querySelectorAll(".merchant-check").forEach((n) => { n.checked = e.target.checked; });
  updatePickCount();
});
$("#pick-high").addEventListener("click", () => {
  const high = new Set(state.collection.merchants.filter((m) => m.level === "高").map((m) => m.merchant));
  document.querySelectorAll(".merchant-check").forEach((n) => { n.checked = high.has(n.dataset.merchant); });
  updatePickCount();
});
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("merchant-check")) updatePickCount();
});

$("#gen-letters").addEventListener("click", async () => {
  const chosen = selected();
  if (!chosen.length) return msg("请先勾选商户", true);
  const btn = $("#gen-letters");
  btn.disabled = true;
  btn.textContent = "生成中…";
  try {
    const data = await api("/api/collection/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchants: chosen }),
    });
    renderLetters(data.letters, data.batch, data.zip);
    msg(`已生成 ${data.count} 份函件`);
    await loadState();
  } catch (err) {
    msg("出函失败：" + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "为勾选商户生成";
  }
});

$("#gen-litigation").addEventListener("click", async () => {
  const chosen = selected();
  if (!chosen.length) return msg("请先勾选商户", true);
  const btn = $("#gen-litigation");
  btn.disabled = true;
  btn.textContent = "生成中…";
  try {
    const data = await api("/api/collection/litigation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchants: chosen.map((x) => x.merchant) }),
    });
    const rows = [{ folder: data.folder, name: data.xlsx_name,
      label: `材料清单汇总（${data.records.length} 户）` }]
      .concat(data.records.map((r) => ({ folder: data.folder, name: r.docx_name,
        label: `${r.merchant} · ${r.level}优先级` })));
    renderLitigationLinks(rows);
    msg(`已生成 ${data.records.length} 户诉讼材料清单`);
    await loadState();
  } catch (err) {
    msg("生成失败：" + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "为勾选商户生成";
  }
});

$("#gen-monthly").addEventListener("click", async () => {
  const btn = $("#gen-monthly");
  btn.disabled = true;
  btn.textContent = "生成中…";
  try {
    const data = await api("/api/collection/monthly");
    renderMonthly(data.summary, data.folder, data.xlsx_name);
    msg("月度清收进展已生成");
    await loadState();
  } catch (err) {
    msg("生成失败：" + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "生成月报";
  }
});

const modal = $("#settings-modal");
$("#open-settings").addEventListener("click", () => { modal.hidden = false; });
$("#close-settings").addEventListener("click", () => { modal.hidden = true; });
$("#cancel-settings").addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

const letterModal = $("#letter-modal");
$("#letter-close").addEventListener("click", closeLetterModal);
$("#letter-cancel").addEventListener("click", closeLetterModal);
letterModal.addEventListener("click", (e) => { if (e.target === letterModal) closeLetterModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !letterModal.hidden) closeLetterModal(); });
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = Object.fromEntries(new FormData(e.target));
  try {
    state.settings = await api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    modal.hidden = true;
    msg("函件信息已保存");
    await loadState();
  } catch (err) {
    msg("保存失败：" + err.message, true);
  }
});

loadState();
