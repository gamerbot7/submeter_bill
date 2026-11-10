/* app.js — UI, screens and actions */
const UI = {
  tab: 'home',
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  hy: new Date().getFullYear(),
  cmp: null,
  wa: { month: null, kind: 'bill', text: null, sel: null },
  U: null, queue: null, lock: false, suPhoto: null
};
const CAP = window.Capacitor || {};
const plug = n => CAP.Plugins && CAP.Plugins[n];
const isNative = () => !!(CAP.isNativePlatform && CAP.isNativePlatform());
const chipCls = s => ({ 'Paid': 'ok', 'Partially Paid': 'warn', 'Unpaid': 'bad' }[s] || 'mute');
const chip = s => `<span class="chip ${chipCls(s)}">${esc(s)}</span>`;
const recOf = k => S.readings.find(r => r.month === k);
const curRec = () => recOf(monthKey());
const lastRec = () => { const s = sortedReadings(); return s[s.length - 1]; };
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const getP = p => p.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
const setP = (p, v) => { const ks = p.split('.'); let o = S; ks.slice(0, -1).forEach(k => o = o[k]); o[ks[ks.length - 1]] = v; };
const monthOptions = () => { const n = new Date(), out = []; for (let i = 0; i < 12; i++) out.push(monthKey(new Date(n.getFullYear(), n.getMonth() - i, 1))); return out; };
function nextReminder() {
  const now = new Date(), [h, m] = S.settings.reminderTime.split(':').map(Number);
  let d = new Date(now.getFullYear(), now.getMonth(), 1, h, m);
  if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, 1, h, m);
  return d;
}

/* ================= sheets ================= */
function openSheet(html, o = {}) {
  UI.lock = !!o.lock;
  const s = $('#sheet'), st = s.scrollTop;
  s.innerHTML = html;
  s.classList.toggle('full', !!o.full);
  $('#sheetWrap').classList.remove('hidden');
  s.scrollTop = o.keep ? st : 0;
  hydrate(s);
}
function closeSheet() {
  if (UI.lock) return;
  $('#sheetWrap').classList.add('hidden');
  $('#sheet').innerHTML = '';
  UI.U = null; UI.queue = null;
}
const sheetOpen = () => !$('#sheetWrap').classList.contains('hidden');
async function hydrate(root) {
  for (const im of $$('img[data-photo]', root)) {
    try { const d = await DB.get('photo:' + im.dataset.photo); if (d) im.src = d; } catch (e) { /* ignore */ }
  }
}

/* ================= photo / files ================= */
async function shrink(src, max = 1600) {
  const i = await loadImg(src), sc = Math.min(1, max / Math.max(i.width, i.height));
  const c = document.createElement('canvas');
  c.width = Math.round(i.width * sc); c.height = Math.round(i.height * sc);
  c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
async function pickPhoto(source) {
  const cam = plug('Camera');
  let raw = null;
  if (isNative() && cam) {
    try {
      const r = await cam.getPhoto({ quality: 85, resultType: 'dataUrl', source: source === 'camera' ? 'CAMERA' : 'PHOTOS', width: 1600, correctOrientation: true, saveToGallery: false });
      raw = r.dataUrl;
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) toast('Camera/gallery error: ' + ((e && e.message) || e));
      return null;
    }
  } else {
    raw = await new Promise(res => {
      const inp = $('#fileIn'); inp.value = '';
      if (source === 'camera') inp.setAttribute('capture', 'environment'); else inp.removeAttribute('capture');
      inp.onchange = () => { const f = inp.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(f); };
      inp.click();
    });
  }
  return raw ? shrink(raw) : null;
}
async function shareFile(name, data, mime, isBase64) {
  if (isNative() && plug('Filesystem') && plug('Share')) {
    const opt = { path: name, data, directory: 'CACHE' };
    if (!isBase64) opt.encoding = 'utf8';
    await plug('Filesystem').writeFile(opt);
    const { uri } = await plug('Filesystem').getUri({ path: name, directory: 'CACHE' });
    await plug('Share').share({ title: name, url: uri, dialogTitle: 'Save or share ' + name });
  } else {
    const blob = isBase64 ? new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: mime }) : new Blob([data], { type: mime });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
}
async function openExternal(url, fallback) {
  const AL = plug('AppLauncher');
  try { if (AL) { const r = await AL.openUrl({ url }); if (r && r.completed === false && fallback) await AL.openUrl({ url: fallback }); return; } } catch (e) { if (fallback && AL) { try { await AL.openUrl({ url: fallback }); return; } catch (e2) { /* fall through */ } } }
  window.open(fallback || url, '_blank');
}

/* ================= charts ================= */
function barChart(items, color, fmt) {
  const W = 340, H = 130, bw = W / items.length, max = Math.max(1, ...items.map(i => i.v));
  return `<svg viewBox="0 0 ${W} ${H + 18}" class="chart">` + items.map((it, i) => {
    const h = Math.round((it.v / max) * (H - 16)), x = i * bw + bw * 0.15, w = bw * 0.7;
    return `<rect x="${x}" y="${H - h}" width="${w}" height="${Math.max(h, 2)}" rx="3" fill="${color}" opacity="${it.v ? 1 : 0.2}"/>` +
      (it.v ? `<text x="${x + w / 2}" y="${H - h - 3}" class="cv">${fmt(it.v)}</text>` : '') +
      `<text x="${x + w / 2}" y="${H + 13}" class="cl">${it.l}</text>`;
  }).join('') + '</svg>';
}
const short = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));

/* ================= views ================= */
function render() {
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  $('#sub').textContent = S.settings.tenant ? S.settings.tenant + (S.settings.room ? ' · ' + S.settings.room : '') : '';
  const v = $('#view'), st = v.scrollTop;
  v.innerHTML = ({ home: vHome, cal: vCal, hist: vHist, wa: vWa, set: vSet })[UI.tab]();
  v.scrollTop = st;
  hydrate(v);
}

function vHome() {
  const mk = monthKey(), cur = curRec(), last = lastRec(), T = totals(), sh = cur || last;
  let amt = '₹0', sub = 'No readings yet — upload your first meter photo.';
  if (cur) { amt = fmtINR(cur.amount); sub = `${monthLabel(mk)} · ${fmtNum(cur.units)} units × ${fmtINR(cur.rate)}`; }
  else if (last) { amt = '≈ ' + fmtINR(round2(last.units * S.settings.rate)); sub = `Estimate for ${monthLabel(mk)} based on ${monthLabel(last.month)} usage`; }
  const st = (a, b) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`;
  return `<section class="hero"><div class="hl">${esc(S.settings.tenant || 'Tenant')}${S.settings.room ? ' · ' + esc(S.settings.room) : ''}</div>
    <div class="big">${amt}</div><div class="hs">${sub}</div>${cur ? chip(statusFor(cur)) : ''}</section>
  ${cur ? '' : `<div class="banner"><span>📸 Reading for <b>${monthLabel(mk)}</b> is pending</span><button class="btn sm" data-act="openUpload">Upload</button></div>`}
  <div class="grid2">
    ${st('Current reading', sh ? fmtNum(sh.reading) : fmtNum(S.settings.initialReading))}
    ${st('Previous reading', sh ? fmtNum(sh.prevReading) : '—')}
    ${st('Units this month', cur ? fmtNum(cur.units) : '—')}
    ${st('Rate per unit', fmtINR(S.settings.rate))}
    ${st('Payment status', cur ? statusFor(cur) : '—')}
    ${st('Last upload', sh ? fmtDate(sh.confirmedAt) : '—')}
    ${st('Next reminder', fmtDate(nextReminder()))}
    ${st('Outstanding', fmtINR(T.outstanding))}
  </div>
  <div class="qa">
    <button data-act="openUpload"><i>📸</i>Upload Meter Photo</button>
    <button data-act="viewBill"><i>🧾</i>View Current Bill</button>
    <button data-act="tab" data-tab="cal"><i>📅</i>Open Calendar</button>
    <button data-act="sendBill"><i>💬</i>Send WhatsApp Bill</button>
    <button data-act="tab" data-tab="hist"><i>📊</i>View History</button>
    <button data-act="tab" data-tab="set"><i>⚙️</i>Settings</button>
  </div>`;
}

function vCal() {
  const { y, m } = UI.cal, k = y + '-' + pad(m + 1), now = monthKey(), start = (S.settings.initialDate || todayISO()).slice(0, 7);
  const tiles = MONTHS.map((n, i) => {
    const key = y + '-' + pad(i + 1), r = recOf(key);
    let cls = 'mute', body = '<small>—</small>';
    if (r) { const s = statusFor(r); cls = chipCls(s); body = `<b>${fmtINR(r.amount)}</b><small>${fmtNum(r.units)} u · ${s === 'Partially Paid' ? 'Partial' : s}</small>`; }
    else if (key <= now && key >= start) { cls = 'pend'; body = '<small>Pending</small>'; }
    return `<button class="tile ${cls} ${key === k ? 'sel' : ''}" data-act="calMonth" data-i="${i}"><em>${n.slice(0, 3)}</em>${body}</button>`;
  }).join('');
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), td = todayISO();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    cells += `<button class="day ${iso === td ? 'today' : ''} ${d === 1 ? 'first' : ''} ${S.notes[iso] ? 'hasnote' : ''}" data-act="dayNote" data-date="${iso}">${d}${d === 1 ? '<i>📸</i>' : ''}</button>`;
  }
  const r = recOf(k);
  return `<div class="navrow"><button data-act="calYear" data-d="-1">«</button><b>${y}</b><button data-act="calYear" data-d="1">»</button></div>
  <div class="tiles">${tiles}</div>
  <div class="card"><div class="navrow"><button data-act="calNav" data-d="-1">‹</button><b>${MONTHS[m].toUpperCase()} ${y}</b><button data-act="calNav" data-d="1">›</button></div>
    ${r ? `<table class="kv"><tr><td>Units Used</td><td>${fmtNum(r.units)}</td></tr><tr><td>Electricity Cost</td><td>${fmtINR(r.amount)}</td></tr><tr><td>Payment Status</td><td>${chip(statusFor(r))}</td></tr></table>`
        : `<p class="muted">No reading saved for this month.</p>`}
    <button class="btn ghost" data-act="openMonth" data-k="${k}">Open ${MONTHS[m]} details</button>
    <h3>Dates &amp; notes</h3>
    <div class="dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span>${d}</span>`).join('')}</div>
    <div class="days">${cells}</div>
    <p class="muted small">📸 = 1st of month (meter reading day) · yellow dot = note · tap a date to add a note</p></div>`;
}

function vHist() {
  const years = [...new Set([...S.readings.map(r => +r.month.slice(0, 4)), new Date().getFullYear()])].sort((a, b) => b - a);
  if (!years.includes(UI.hy)) UI.hy = years[0];
  const ys = S.readings.filter(r => r.month.startsWith(UI.hy + '-')), yt = totals(ys), all = totals();
  const byUnits = [...ys].sort((a, b) => a.units - b.units);
  const avg = ys.length ? round2(ys.reduce((a, r) => a + r.units, 0) / ys.length) : 0;
  const hi = byUnits[byUnits.length - 1], lo = byUnits[0];
  const mItems = MONTHS.map((n, i) => ({ l: n.slice(0, 3), r: recOf(UI.hy + '-' + pad(i + 1)) }));
  const yearsAsc = [...years].reverse();
  const yUnits = yearsAsc.map(y => ({ l: String(y), v: S.readings.filter(r => r.month.startsWith(y + '-')).reduce((a, r) => a + r.units, 0) }));
  const yAmt = yearsAsc.map(y => ({ l: String(y), v: S.readings.filter(r => r.month.startsWith(y + '-')).reduce((a, r) => a + r.amount, 0) }));
  const sr = sortedReadings().reverse();
  if (!UI.cmp || !recOf(UI.cmp.a) || !recOf(UI.cmp.b)) UI.cmp = sr.length ? { a: sr[0].month, b: (sr[1] || sr[0]).month } : null;
  const opt = sel => sr.map(r => `<option value="${r.month}" ${r.month === sel ? 'selected' : ''}>${monthLabel(r.month)}</option>`).join('');
  let cmp = '<p class="muted">Add readings to compare months.</p>';
  if (UI.cmp) {
    const A = recOf(UI.cmp.a), B = recOf(UI.cmp.b), dl = (x, y) => { const d = round2(x - y); return (d > 0 ? '+' : '') + fmtNum(d); };
    cmp = `<div class="row"><select id="cmpA">${opt(UI.cmp.a)}</select><select id="cmpB">${opt(UI.cmp.b)}</select></div>
      <table class="kv"><tr><td></td><td>${monthLabel(A.month).slice(0, 8)}</td><td>${monthLabel(B.month).slice(0, 8)}</td><td>Diff</td></tr>
      <tr><td>Units</td><td>${fmtNum(A.units)}</td><td>${fmtNum(B.units)}</td><td>${dl(A.units, B.units)}</td></tr>
      <tr><td>Amount</td><td>${fmtINR(A.amount)}</td><td>${fmtINR(B.amount)}</td><td>${dl(A.amount, B.amount)}</td></tr></table>`;
  }
  const stat = (a, b) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`;
  return `<div class="navrow"><button data-act="histYear" data-d="-1">‹</button><b>${UI.hy}</b><button data-act="histYear" data-d="1">›</button></div>
  <div class="grid2">
    ${stat('Collected (all time)', fmtINR(all.collected))}${stat('Outstanding (all time)', fmtINR(all.outstanding))}
    ${stat('Year units', fmtNum(ys.reduce((a, r) => a + r.units, 0)))}${stat('Year expense', fmtINR(yt.billed))}
    ${stat('Avg monthly units', fmtNum(avg))}${stat('Collected this year', fmtINR(yt.collected))}
    ${stat('Highest month', hi ? monthLabel(hi.month).slice(0, 3) + ' · ' + fmtNum(hi.units) : '—')}${stat('Lowest month', lo ? monthLabel(lo.month).slice(0, 3) + ' · ' + fmtNum(lo.units) : '—')}
  </div>
  <div class="card"><h3 style="margin-top:0">Monthly consumption (units)</h3>${barChart(mItems.map(x => ({ l: x.l, v: x.r ? x.r.units : 0 })), 'var(--b)', short)}</div>
  <div class="card"><h3 style="margin-top:0">Monthly expense (₹)</h3>${barChart(mItems.map(x => ({ l: x.l, v: x.r ? x.r.amount : 0 })), 'var(--g)', short)}</div>
  <div class="card"><h3 style="margin-top:0">Yearly consumption (units)</h3>${barChart(yUnits, 'var(--b)', short)}</div>
  <div class="card"><h3 style="margin-top:0">Yearly expense (₹)</h3>${barChart(yAmt, 'var(--g)', short)}</div>
  <div class="card"><h3 style="margin-top:0">Compare months</h3>${cmp}</div>
  <div class="row"><button class="btn ghost" data-act="exportCSV">⬇ CSV</button><button class="btn ghost" data-act="exportPDF">⬇ PDF</button></div>
  <h3>All months</h3><div class="card list">${sr.length ? sr.map(r => `<div data-act="openMonth" data-k="${r.month}"><span><b>${monthLabel(r.month)}</b><br><span class="muted">${fmtNum(r.units)} units</span></span><span style="text-align:right"><b>${fmtINR(r.amount)}</b><br>${chip(statusFor(r))}</span></div>`).join('') : '<p class="muted">No readings yet.</p>'}</div>`;
}

function vWa() {
  const W = UI.wa, months = sortedReadings().map(r => r.month).reverse();
  if (!W.month || !months.includes(W.month)) { W.month = months[0] || null; W.text = null; }
  W.sel = (W.sel === null ? S.contacts.map(c => c.id) : W.sel.filter(id => S.contacts.some(c => c.id === id)));
  const rec = W.month ? recOf(W.month) : null;
  if (W.text === null) W.text = (rec || W.kind === 'custom') ? fillTemplate(S.settings.templates[W.kind], rec) : '';
  const kinds = [['bill', 'Monthly bill'], ['reminder', 'Payment reminder'], ['received', 'Payment received'], ['custom', 'Custom']];
  return `<h3 style="margin-top:6px">Saved numbers (${S.contacts.length}/5)</h3>
  <div class="card list">${S.contacts.map(c => `<div><span><b>${esc(c.name)}</b><br><span class="muted">+${esc(normPhone(c.phone))}</span></span><span><button class="x" data-act="editContact" data-id="${c.id}">✏️</button> <button class="x" data-act="delContact" data-id="${c.id}">🗑</button></span></div>`).join('') || '<p class="muted">No numbers saved yet.</p>'}
    <button class="btn ghost" data-act="editContact" ${S.contacts.length >= 5 ? 'disabled style="opacity:.5"' : ''}>＋ Add number</button></div>
  <h3>Compose message</h3>
  <div class="card">
    <label class="fld"><span>Billing month</span><select id="waMonth">${months.map(k => `<option value="${k}" ${k === W.month ? 'selected' : ''}>${monthLabel(k)}</option>`).join('') || '<option>No bills yet</option>'}</select></label>
    <div>${kinds.map(([k, l]) => `<button class="chipbtn ${W.kind === k ? 'on' : ''}" data-act="waKind" data-kind="${k}">${l}</button>`).join('')}</div>
    <label class="fld"><span>Message (editable)</span><textarea id="waText" rows="12">${esc(W.text)}</textarea></label>
    <button class="btn ghost" data-act="waReset">↺ Re-fill from template</button>
    <h3>Send to</h3>
    ${S.contacts.map(c => `<label style="display:flex;gap:10px;align-items:center;padding:6px 0"><input type="checkbox" data-wasel="${c.id}" ${W.sel.includes(c.id) ? 'checked' : ''}> ${esc(c.name)} <span class="muted">+${esc(normPhone(c.phone))}</span></label>`).join('') || '<p class="muted">Add a number first.</p>'}
    <button class="btn blue" data-act="waSend">💬 Open WhatsApp</button>
    <p class="muted small">Nothing is sent automatically. WhatsApp opens with the message ready and you press send.</p>
  </div>
  <button class="btn ghost" data-act="tab" data-tab="set">Edit message templates in Settings</button>`;
}

function vSet() {
  const s = S.settings;
  const f = (label, path, type = 'text', extra = '') => `<label class="fld"><span>${label}</span><input data-bind="${path}" data-type="${type}" type="${type}" value="${esc(getP(path))}" ${extra}></label>`;
  const tpl = (label, k) => `<label class="fld"><span>${label}</span><textarea data-bind="settings.templates.${k}" rows="7">${esc(s.templates[k])}</textarea></label>`;
  return `<h3 style="margin-top:6px">Tenant</h3><div class="card">${f('Tenant name', 'settings.tenant')}${f('Room / flat number', 'settings.room')}<p class="muted small">WhatsApp numbers are managed in the WhatsApp tab.</p></div>
  <h3>Billing &amp; meter</h3><div class="card">
    ${f('Electricity rate (₹ per unit)', 'settings.rate', 'number', 'step="0.01" min="0"')}
    <p class="muted small">Changing the rate affects only readings you save from now on. Saved bills keep the rate they were made with.</p>
    ${f('Initial meter reading', 'settings.initialReading', 'number', 'step="any"')}
    ${f('Meter digits (for rollover)', 'settings.meterDigits', 'number', 'min="3" max="9"')}
    ${f('Warn if units exceed', 'settings.highUsage', 'number', 'min="1"')}
    <span class="muted small">Currency: INR (₹)</span></div>
  <h3>Reminders</h3><div class="card">
    ${f('Reminder time (1st of every month)', 'settings.reminderTime', 'time')}
    <label class="fld"><span>Follow-up reminders if no reading yet</span><select data-bind="settings.followUps" data-type="text">
      <option value="off" ${s.followUps === 'off' ? 'selected' : ''}>Off (only on the 1st)</option>
      <option value="standard" ${s.followUps === 'standard' ? 'selected' : ''}>Standard (3rd and 6th)</option>
      <option value="frequent" ${s.followUps === 'frequent' ? 'selected' : ''}>Frequent (daily, 2nd–7th)</option></select></label>
    <div class="row"><button class="btn ghost" data-act="enableNotif">Enable notifications</button><button class="btn ghost" data-act="testNotif">Send test (5 sec)</button></div></div>
  <h3>WhatsApp templates</h3><div class="card"><p class="muted small">Tags: {month} {year} {tenant_name} {room_number} {previous_reading} {current_reading} {units} {rate} {amount} {payment_status} {paid} {balance}</p>
    ${tpl('Monthly electricity bill', 'bill')}${tpl('Payment reminder', 'reminder')}${tpl('Payment received', 'received')}${tpl('Custom message', 'custom')}
    <button class="btn ghost" data-act="resetTpl">Restore default templates</button></div>
  <h3>Appearance</h3><div class="card"><label class="fld"><span>Theme</span><select data-bind="settings.theme" data-type="text"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option></select></label></div>
  <h3>Data</h3><div class="card">
    <button class="btn ghost" data-act="backup">💾 Backup (all data + photos)</button>
    <button class="btn ghost" data-act="restore">♻ Restore from backup</button>
    <div class="row"><button class="btn ghost" data-act="exportCSV">Export CSV</button><button class="btn ghost" data-act="exportPDF">Export PDF</button></div>
    <button class="btn danger" data-act="resetAll">Delete all billing records…</button></div>
  <p class="muted small" style="text-align:center">SubMeter Bill · works fully offline · all data stays on this phone</p>`;
}

/* ================= month detail / payments / edit ================= */
function openMonth(k) {
  const r = recOf(k);
  let h = `<div class="sh-h"><h2>${monthLabel(k)}</h2><button class="x" data-act="closeSheet">✕</button></div>`;
  if (!r) {
    h += `<p class="muted">No meter reading saved for this month.</p><button class="btn" data-act="openUpload" data-month="${k}">📸 Upload reading for ${monthLabel(k)}</button>`;
  } else {
    const paid = paidFor(k), bal = Math.max(0, round2(r.amount - paid)), ps = S.payments.filter(p => p.month === k);
    const msgs = S.messages.filter(m => m.month === k);
    h += `<div class="amt"><span>${fmtINR(r.amount)}</span>${chip(statusFor(r))}</div>
    <table class="kv"><tr><td>Previous reading</td><td>${fmtNum(r.prevReading)}</td></tr><tr><td>Current reading</td><td>${fmtNum(r.reading)}${r.mode !== 'normal' ? ' (' + r.mode + ')' : ''}</td></tr>
    <tr><td>Units consumed</td><td>${fmtNum(r.units)}</td></tr><tr><td>Rate per unit</td><td>${fmtINR(r.rate)}</td></tr><tr><td>Total amount</td><td>${fmtINR(r.amount)}</td></tr>
    <tr><td>Paid</td><td>${fmtINR(paid)}</td></tr><tr><td>Balance</td><td>${fmtINR(bal)}</td></tr><tr><td>Reading confirmed</td><td>${fmtDate(r.confirmedAt)}</td></tr></table>
    ${r.photoId ? `<img class="thumb" data-photo="${r.photoId}" data-act="viewPhoto" data-id="${r.photoId}" alt="Meter photo">` : ''}
    <div class="row"><button class="btn" data-act="addPay" data-month="${k}">＋ Payment${bal > 0 ? ' / mark paid' : ''}</button><button class="btn blue" data-act="waFor" data-month="${k}" data-kind="bill">💬 WhatsApp</button></div>
    <div class="row"><button class="btn ghost" data-act="editReading" data-month="${k}">✏️ Correct reading</button><button class="btn danger" data-act="delRecord" data-month="${k}">🗑 Delete</button></div>
    <h3>Payments</h3><div class="card list">${ps.map(p => `<div><span><b>${fmtINR(p.amount)}</b> · ${esc(p.method)}<br><span class="muted">${fmtDate(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</span></span><button class="x" data-act="delPay" data-id="${p.id}" data-month="${k}">🗑</button></div>`).join('') || '<p class="muted">No payments recorded.</p>'}</div>
    <h3>Note</h3><textarea data-monthnote="${k}" rows="2" placeholder="Add a note for this month">${esc(r.note || '')}</textarea>
    ${r.history.length ? `<h3>Correction history</h3><div class="card muted small">${r.history.map(x => `${fmtDate(x.at)}: ${fmtNum(x.from)} → ${fmtNum(x.to)}${x.reason ? ' (' + esc(x.reason) + ')' : ''}`).join('<br>')}</div>` : ''}
    ${msgs.length ? `<h3>WhatsApp sent</h3><div class="card muted small">${msgs.map(m => `${fmtDate(m.at)} · ${esc(m.kind)} → ${esc(m.to)}`).join('<br>')}</div>` : ''}`;
  }
  openSheet(h);
}

function openPay(k) {
  const r = recOf(k), bal = Math.max(0, round2(r.amount - paidFor(k)));
  openSheet(`<div class="sh-h"><h2>Payment · ${monthLabel(k)}</h2><button class="x" data-act="openMonth" data-k="${k}">✕</button></div>
  <p class="muted">Bill ${fmtINR(r.amount)} · Balance due <b>${fmtINR(bal)}</b>. Partial payments are fine.</p>
  <label class="fld"><span>Amount received (₹)</span><input id="pyAmt" type="number" step="any" value="${bal}"></label>
  <label class="fld"><span>Date</span><input id="pyDate" type="date" value="${todayISO()}"></label>
  <label class="fld"><span>Method</span><select id="pyMethod"><option>Cash</option><option>UPI</option><option>Bank transfer</option><option>Other</option></select></label>
  <label class="fld"><span>Note (optional)</span><input id="pyNote" type="text"></label>
  <button class="btn" data-act="savePay" data-month="${k}">Save payment</button>`);
}

function openEdit(k) {
  const r = recOf(k);
  openSheet(`<div class="sh-h"><h2>Correct reading · ${monthLabel(k)}</h2><button class="x" data-act="openMonth" data-k="${k}">✕</button></div>
  <p class="muted">Previous reading: <b>${fmtNum(r.prevReading)}</b>. The old value is kept in the correction history.</p>
  <label class="fld"><span>Correct meter reading</span><input id="edReading" type="number" step="any" value="${r.reading}"></label>
  <label class="fld"><span>Meter mode</span><select id="edMode"><option value="normal" ${r.mode === 'normal' ? 'selected' : ''}>Normal</option><option value="reset" ${r.mode === 'reset' ? 'selected' : ''}>Meter was reset to 0</option><option value="rollover" ${r.mode === 'rollover' ? 'selected' : ''}>Meter rolled over</option></select></label>
  <label class="fld"><span>Reason (optional)</span><input id="edReason" type="text" placeholder="e.g. OCR misread"></label>
  <button class="btn" data-act="saveEdit" data-month="${k}">Save correction</button>`);
}

function openContact(id) {
  const c = S.contacts.find(x => x.id === id) || { name: '', phone: '' };
  openSheet(`<div class="sh-h"><h2>${id ? 'Edit' : 'Add'} WhatsApp number</h2><button class="x" data-act="closeSheet">✕</button></div>
  <label class="fld"><span>Name</span><input id="ctName" type="text" value="${esc(c.name)}"></label>
  <label class="fld"><span>WhatsApp number (10 digits, or with country code)</span><input id="ctPhone" type="tel" value="${esc(c.phone)}"></label>
  <button class="btn" data-act="saveContact" data-id="${id || ''}">Save</button>`);
}

/* ================= setup (first run) ================= */
function openSetup() {
  UI.suPhoto = null;
  openSheet(`<h2>Welcome 👋</h2><p class="muted">Quick one-time setup for your sub-meter billing.</p>
  <label class="fld"><span>Tenant name *</span><input id="suName" type="text"></label>
  <label class="fld"><span>Room / flat number</span><input id="suRoom" type="text"></label>
  <label class="fld"><span>Tenant WhatsApp number</span><input id="suPhone" type="tel" placeholder="10-digit mobile number"></label>
  <label class="fld"><span>Rate per unit (₹)</span><input id="suRate" type="number" step="0.01" value="11"></label>
  <label class="fld"><span>Initial meter photo (optional)</span></label>
  <div class="row"><button class="btn ghost" data-act="suPhoto" data-src="camera">📷 Camera</button><button class="btn ghost" data-act="suPhoto" data-src="gallery">🖼 Gallery</button></div>
  <img id="suImg" class="thumb hidden" alt="Initial meter photo"><div id="suStatus" class="muted small"></div>
  <label class="fld"><span>Initial meter reading *</span><input id="suReading" type="number" step="any" placeholder="e.g. 12450"></label>
  <label class="fld"><span>Date of this reading</span><input id="suDate" type="date" value="${todayISO()}"></label>
  <button class="btn" data-act="saveSetup">Save &amp; start</button>`, { full: true, lock: true });
}

/* ================= upload / OCR ================= */
function openUpload(month) {
  UI.U = { month: month || monthKey(), photo: null, cands: [], reading: '', mode: 'normal', detected: null, status: '' };
  drawUpload();
}
function calcPreview(U) {
  const reading = parseFloat(U.reading);
  if (isNaN(reading)) return null;
  const prev = prevReadingFor(U.month), units = round2(computeUnits(prev, reading, U.mode, S.settings.meterDigits));
  return { reading, prev, units, amount: round2(units * S.settings.rate) };
}
function previewHtml(U) {
  const p = calcPreview(U);
  if (!p) return '<p class="muted">Enter the reading to see the bill.</p>';
  let w = '';
  if (recOf(U.month)) w += `<div class="warn-box">A reading for ${monthLabel(U.month)} is already saved. Open it from the calendar to correct it.</div>`;
  if (U.mode === 'normal' && p.reading < p.prev) w += '<div class="warn-box">⚠ This is lower than the previous reading. Re-check the photo, or choose “reset / rollover” below if the meter restarted.</div>';
  if (p.units > S.settings.highUsage) w += `<div class="warn-box">⚠ Unusually high consumption (${fmtNum(p.units)} units).</div>`;
  return `${w}<table class="kv"><tr><td>Previous reading</td><td>${fmtNum(p.prev)}</td></tr><tr><td>Current reading</td><td>${fmtNum(p.reading)}</td></tr><tr><td>Units consumed</td><td>${fmtNum(p.units)}</td></tr><tr><td>Rate</td><td>${fmtINR(S.settings.rate)}/unit</td></tr><tr><td>Total amount</td><td>${fmtINR(p.amount)}</td></tr></table>`;
}
function drawUpload() {
  const U = UI.U;
  const opts = monthOptions().map(k => `<option value="${k}" ${k === U.month ? 'selected' : ''}>${monthLabel(k)}${recOf(k) ? ' ✔ saved' : ''}</option>`).join('');
  openSheet(`<div class="sh-h"><h2>Meter reading</h2><button class="x" data-act="closeSheet">✕</button></div>
  <label class="fld"><span>Billing month</span><select id="upMonth">${opts}</select></label>
  <div class="row"><button class="btn ghost" data-act="upPhoto" data-src="camera">📷 Take photo</button><button class="btn ghost" data-act="upPhoto" data-src="gallery">🖼 From gallery</button></div>
  ${U.photo ? `<img class="thumb" src="${U.photo}" alt="Meter photo" data-act="viewPhotoRaw">` : ''}
  <div id="ocrStatus" class="muted small">${esc(U.status)}</div>
  ${U.photo ? '<button class="btn ghost sm" data-act="redetect" style="margin-top:6px">🔍 Detect again</button>' : ''}
  <label class="fld"><span>Meter reading (verify against the photo)</span><input id="upReading" type="number" step="any" inputmode="decimal" value="${esc(U.reading)}"></label>
  <div>${U.cands.map(c => `<button class="chipbtn" data-act="useCand" data-v="${c.value}">${fmtNum(c.value)}</button>`).join('')}</div>
  <label class="fld"><span>Meter mode</span><select id="upMode"><option value="normal" ${U.mode === 'normal' ? 'selected' : ''}>Normal</option><option value="reset" ${U.mode === 'reset' ? 'selected' : ''}>Meter was reset to 0</option><option value="rollover" ${U.mode === 'rollover' ? 'selected' : ''}>Meter rolled over (passed ${S.settings.meterDigits}-digit max)</option></select></label>
  <div id="upPrev">${previewHtml(U)}</div>
  <button class="btn" data-act="confirmReading">✔ Confirm reading &amp; generate bill</button>`, { keep: true });
}
const updatePreview = () => { const el = $('#upPrev'); if (el && UI.U) el.innerHTML = previewHtml(UI.U); };
const setStatus = s => { if (!UI.U) return; UI.U.status = s; const el = $('#ocrStatus'); if (el) el.textContent = s; };

async function detect(targetPhoto, onDone) {
  const U = UI.U;
  setStatus('Reading the meter… (first run can take a few seconds)');
  try {
    const r = await OCR.read(targetPhoto, {
      prev: U ? prevReadingFor(U.month) : S.settings.initialReading, digits: S.settings.meterDigits,
      onProgress: m => { if (m.status === 'recognizing text') setStatus('Reading the meter… ' + Math.round((m.progress || 0) * 100) + '%'); }
    });
    onDone(r.list);
  } catch (e) {
    setStatus('Automatic reading unavailable (' + (e.message || e) + '). Please type the reading.');
  }
}

/* ================= actions ================= */
const A = {
  tab: d => { UI.tab = d.tab; render(); },
  closeSheet: () => closeSheet(),
  openUpload: d => openUpload(d && d.month),
  openMonth: d => openMonth(d.k),
  viewBill: () => { const r = curRec() || lastRec(); openMonth(r ? r.month : monthKey()); },
  sendBill: () => { const r = lastRec(); if (!r) return toast('Upload a reading first'); A.waFor({ month: curRec() ? monthKey() : r.month, kind: 'bill' }); },
  waFor: d => { UI.wa.month = d.month; UI.wa.kind = d.kind || 'bill'; UI.wa.text = null; UI.tab = 'wa'; closeSheet(); render(); },
  viewPhoto: d => {
    const r = S.readings.find(x => x.photoId === d.id);
    openSheet(`<div class="sh-h"><h2>Meter photo</h2><button class="x" data-act="${r ? 'openMonth' : 'closeSheet'}" data-k="${r ? r.month : ''}">✕</button></div><img class="thumb" style="max-height:none" data-photo="${d.id}" alt="Meter photo">`);
  },
  viewPhotoRaw: () => { const U = UI.U; if (U && U.photo) window.open(U.photo, '_blank'); },

  /* calendar */
  calMonth: d => { UI.cal.m = +d.i; openMonth(UI.cal.y + '-' + pad(+d.i + 1)); render(); },
  calNav: d => { const dt = new Date(UI.cal.y, UI.cal.m + +d.d, 1); UI.cal = { y: dt.getFullYear(), m: dt.getMonth() }; render(); },
  calYear: d => { UI.cal.y += +d.d; render(); },
  dayNote: d => openSheet(`<div class="sh-h"><h2>${fmtDate(d.date)}</h2><button class="x" data-act="closeSheet">✕</button></div>
    <textarea id="dnText" rows="4" placeholder="Note for this date">${esc(S.notes[d.date] || '')}</textarea>
    <div class="row"><button class="btn" data-act="saveNote" data-date="${d.date}">Save</button><button class="btn danger" data-act="delNote" data-date="${d.date}">Delete</button></div>`),
  saveNote: async d => { const t = $('#dnText').value.trim(); if (t) S.notes[d.date] = t; else delete S.notes[d.date]; await save(); closeSheet(); render(); },
  delNote: async d => { delete S.notes[d.date]; await save(); closeSheet(); render(); },
  histYear: d => { UI.hy += +d.d; render(); },

  /* setup */
  suPhoto: async d => {
    const p = await pickPhoto(d.src); if (!p) return;
    UI.suPhoto = p; const im = $('#suImg'); im.src = p; im.classList.remove('hidden');
    const st = $('#suStatus'); st.textContent = 'Reading the meter…';
    try {
      const r = await OCR.read(p, { prev: 0, digits: S.settings.meterDigits, onProgress: m => { if (m.status === 'recognizing text') st.textContent = 'Reading the meter… ' + Math.round((m.progress || 0) * 100) + '%'; } });
      if (r.list.length) { $('#suReading').value = r.list[0].value; st.textContent = 'Detected ' + r.list[0].value + ' — please verify against the photo.'; }
      else st.textContent = 'Could not detect a number. Please type the reading.';
    } catch (e) { st.textContent = 'Automatic reading unavailable. Please type the reading.'; }
  },
  saveSetup: async () => {
    const name = $('#suName').value.trim(), rd = parseFloat($('#suReading').value), rate = parseFloat($('#suRate').value);
    if (!name) return toast('Enter the tenant name');
    if (isNaN(rd)) return toast('Enter the initial meter reading');
    if (!(rate > 0)) return toast('Enter a valid rate');
    const phone = $('#suPhone').value.trim();
    Object.assign(S.settings, { tenant: name, room: $('#suRoom').value.trim(), rate, initialReading: rd, initialDate: $('#suDate').value || todayISO(), setupDone: true });
    if (phone) S.contacts.push({ id: uid(), name, phone });
    if (UI.suPhoto) await DB.set('photo:initial', UI.suPhoto);
    await save(); UI.lock = false; closeSheet(); render();
    Reminders.reschedule(true);
  },

  /* upload flow */
  upPhoto: async d => {
    const p = await pickPhoto(d.src); if (!p) return;
    const U = UI.U; U.photo = p; U.cands = []; U.reading = ''; U.detected = null; U.status = '';
    drawUpload();
    await detect(p, list => {
      U.cands = list; U.detected = list[0] ? list[0].value : null;
      if (list.length && !U.reading) U.reading = list[0].value;
      U.status = list.length ? 'Detected automatically — please verify with the photo before confirming.' : 'No number detected. Please type the reading.';
      drawUpload();
    });
  },
  redetect: async () => {
    const U = UI.U; if (!U || !U.photo) return;
    U.reading = '';
    await detect(U.photo, list => { U.cands = list; U.detected = list[0] ? list[0].value : null; if (list.length) U.reading = list[0].value; U.status = list.length ? 'Detected — please verify.' : 'No number detected. Please type the reading.'; drawUpload(); });
  },
  useCand: d => { UI.U.reading = d.v; const el = $('#upReading'); if (el) el.value = d.v; updatePreview(); },
  confirmReading: async () => {
    const U = UI.U, p = calcPreview(U);
    if (!p) return toast('Enter the meter reading');
    if (recOf(U.month)) { toast('Already saved for this month — opening it'); return openMonth(U.month); }
    if (U.mode === 'normal' && p.reading < p.prev) return toast('Lower than previous reading — verify, or mark reset/rollover');
    if (p.units > S.settings.highUsage && !confirm(`${fmtNum(p.units)} units is unusually high. Save anyway?`)) return;
    if (!U.photo && !confirm('Save without a meter photo?')) return;
    const photoId = U.photo ? 'p' + uid() : null;
    if (photoId) await DB.set('photo:' + photoId, U.photo);
    const rec = { id: uid(), month: U.month, reading: p.reading, prevReading: p.prev, mode: U.mode, digits: S.settings.meterDigits, units: p.units, rate: S.settings.rate, amount: p.amount, confirmedAt: new Date().toISOString(), photoId, ocrSuggestion: U.detected, history: [], note: '' };
    S.readings.push(rec);
    await save();
    const month = U.month;
    closeSheet(); UI.tab = 'home'; render();
    Reminders.reschedule(false);
    if (confirm(`Bill generated: ${fmtINR(rec.amount)} for ${monthLabel(month)}.\n\nSend it on WhatsApp now?`)) A.waFor({ month, kind: 'bill' });
  },

  /* payments */
  addPay: d => openPay(d.month),
  savePay: async d => {
    const r = recOf(d.month), amt = parseFloat($('#pyAmt').value), bal = Math.max(0, round2(r.amount - paidFor(d.month)));
    if (!(amt > 0)) return toast('Enter the amount');
    if (amt > bal + 0.005 && !confirm('This is more than the balance due. Record anyway?')) return;
    S.payments.push({ id: uid(), month: d.month, amount: round2(amt), date: $('#pyDate').value || todayISO(), method: $('#pyMethod').value, note: $('#pyNote').value.trim() });
    await save(); openMonth(d.month); render(); toast('Payment saved ✓');
    if (confirm('Send a “payment received” message on WhatsApp?')) A.waFor({ month: d.month, kind: 'received' });
  },
  delPay: async d => { if (!confirm('Delete this payment entry?')) return; S.payments = S.payments.filter(p => p.id !== d.id); await save(); openMonth(d.month); render(); },
  editReading: d => openEdit(d.month),
  saveEdit: async d => {
    const r = recOf(d.month), nv = parseFloat($('#edReading').value), mode = $('#edMode').value;
    if (isNaN(nv)) return toast('Enter the reading');
    if (mode === 'normal' && nv < r.prevReading) return toast('Lower than the previous reading — check or choose reset/rollover');
    r.history.push({ at: new Date().toISOString(), from: r.reading, to: nv, reason: $('#edReason').value.trim() });
    r.reading = nv; r.mode = mode; recalc(r);
    const next = sortedReadings().find(x => x.month > d.month);
    if (next && next.prevReading !== nv && confirm(`${monthLabel(next.month)} used ${fmtNum(next.prevReading)} as its previous reading.\n\nUpdate it to ${fmtNum(nv)} and recalculate that bill too?`)) {
      next.history.push({ at: new Date().toISOString(), from: next.prevReading, to: nv, reason: 'Previous reading updated after correction of ' + monthLabel(d.month) });
      next.prevReading = nv; recalc(next);
    }
    await save(); openMonth(d.month); render(); toast('Correction saved ✓');
  },
  delRecord: async d => {
    if (!confirm(`Delete the ${monthLabel(d.month)} record and its payments? This cannot be undone.`)) return;
    const r = recOf(d.month); if (r && r.photoId) await DB.del('photo:' + r.photoId);
    S.readings = S.readings.filter(x => x.month !== d.month); S.payments = S.payments.filter(p => p.month !== d.month);
    await save(); closeSheet(); render(); Reminders.reschedule(false);
  },

  /* whatsapp */
  editContact: d => { if (!d.id && S.contacts.length >= 5) return toast('Maximum 5 numbers'); openContact(d.id); },
  saveContact: async d => {
    const name = $('#ctName').value.trim(), phone = $('#ctPhone').value.trim();
    if (!name) return toast('Enter a name');
    if (normPhone(phone).length < 10) return toast('Enter a valid phone number');
    if (d.id) { const c = S.contacts.find(x => x.id === d.id); c.name = name; c.phone = phone; }
    else { if (S.contacts.length >= 5) return toast('Maximum 5 numbers'); const c = { id: uid(), name, phone }; S.contacts.push(c); if (UI.wa.sel) UI.wa.sel.push(c.id); }
    await save(); closeSheet(); render();
  },
  delContact: async d => { if (!confirm('Delete this number?')) return; S.contacts = S.contacts.filter(c => c.id !== d.id); await save(); render(); },
  waKind: d => { UI.wa.kind = d.kind; UI.wa.text = null; render(); },
  waReset: () => { UI.wa.text = null; render(); },
  waSend: () => {
    const W = UI.wa, to = S.contacts.filter(c => W.sel.includes(c.id)), text = ($('#waText').value || '').trim();
    if (!to.length) return toast('Select at least one recipient');
    if (!text) return toast('The message is empty');
    UI.queue = { to, text, i: 0, month: W.month, kind: W.kind, opened: false };
    drawQueue();
  },
  waOpen: async () => {
    const q = UI.queue, c = q.to[q.i], num = normPhone(c.phone), enc = encodeURIComponent(q.text);
    S.messages.push({ id: uid(), month: q.month, kind: q.kind, to: c.name, phone: num, at: new Date().toISOString(), text: q.text });
    if (S.messages.length > 500) S.messages = S.messages.slice(-500);
    await save(); q.opened = true;
    await openExternal(`whatsapp://send?phone=${num}&text=${enc}`, `https://wa.me/${num}?text=${enc}`);
  },
  waNext: () => { const q = UI.queue; q.i++; q.opened = false; if (q.i >= q.to.length) { UI.lock = false; closeSheet(); toast('All recipients done ✓'); render(); } else drawQueue(); },

  /* settings */
  resetTpl: async () => { if (!confirm('Restore all four templates to the defaults?')) return; S.settings.templates = { ...defTemplates }; await save(); render(); },
  enableNotif: async () => { const ok = await Reminders.reschedule(true); toast(ok ? 'Reminders enabled ✓' : 'Notifications not allowed — enable them in Android settings'); },
  testNotif: async () => { const ok = await Reminders.test(); toast(ok ? 'Test notification in 5 seconds' : 'Notifications not allowed'); },
  exportCSV: async () => { if (!S.readings.length) return toast('Nothing to export yet'); await shareFile(`submeter-${todayISO()}.csv`, buildCSV(), 'text/csv'); },
  exportPDF: async () => {
    if (!S.readings.length) return toast('Nothing to export yet');
    if (!window.jspdf) return toast('PDF library missing in this build');
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
    const T = totals();
    doc.setFontSize(15); doc.text(`Electricity bills - ${S.settings.tenant} ${S.settings.room || ''}`, 10, 14);
    doc.setFontSize(9); doc.text(`Billed Rs.${fmtNum(T.billed)}   Collected Rs.${fmtNum(T.collected)}   Outstanding Rs.${fmtNum(T.outstanding)}   Generated ${todayISO()}`, 10, 21);
    doc.setFont('courier', 'normal'); doc.setFontSize(8.5);
    const row = c => c.map((v, i) => String(v).padEnd([16, 10, 10, 8, 6, 11, 11, 11, 15][i])).join('');
    let y = 30; doc.text(row(['Month', 'Prev', 'Current', 'Units', 'Rate', 'Amount', 'Paid', 'Balance', 'Status']), 10, y); y += 6;
    sortedReadings().forEach(r => {
      if (y > 195) { doc.addPage(); y = 14; }
      const p = paidFor(r.month);
      doc.text(row([monthLabel(r.month), r.prevReading, r.reading, r.units, r.rate, r.amount, p, Math.max(0, round2(r.amount - p)), statusFor(r)]), 10, y); y += 6;
    });
    const b64 = doc.output('datauristring').split(',')[1];
    await shareFile(`submeter-${todayISO()}.pdf`, b64, 'application/pdf', true);
  },
  backup: async () => {
    const photos = {};
    for (const k of await DB.keys()) if (String(k).startsWith('photo:')) photos[k] = await DB.get(k);
    await shareFile(`submeter-backup-${todayISO()}.json`, JSON.stringify({ app: 'submeter-bill', version: 1, exportedAt: new Date().toISOString(), state: S, photos }), 'application/json');
  },
  restore: () => $('#restoreIn').click(),
  resetAll: async () => {
    if (prompt('This permanently deletes ALL readings, payments, notes, messages and photos.\nType RESET to confirm:') !== 'RESET') return;
    for (const k of await DB.keys()) if (String(k).startsWith('photo:') && k !== 'photo:initial') await DB.del(k);
    S.readings = []; S.payments = []; S.notes = {}; S.messages = [];
    await save(); render(); toast('All billing records deleted'); Reminders.reschedule(false);
  }
};
function drawQueue() {
  const q = UI.queue, c = q.to[q.i];
  openSheet(`<div class="sh-h"><h2>Send ${q.i + 1} of ${q.to.length}</h2><button class="x" data-act="closeSheet">✕</button></div>
  <div class="card"><b>${esc(c.name)}</b><br><span class="muted">+${esc(normPhone(c.phone))}</span></div>
  <button class="btn blue" data-act="waOpen">💬 Open WhatsApp with message</button>
  <p class="muted small">WhatsApp opens with the text ready. Press send there, come back to this app, then tap Next.</p>
  <div class="row"><button class="btn ghost" data-act="waNext">${q.i + 1 >= q.to.length ? 'Finish' : 'Next ▶'}</button></div>`);
}

/* ================= events ================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el.dataset, el)).catch(err => { console.error(err); toast('Error: ' + (err.message || err)); }); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'waText') UI.wa.text = t.value;
  if (t.id === 'upReading' && UI.U) { UI.U.reading = t.value; updatePreview(); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'upMonth') { UI.U.month = t.value; drawUpload(); return; }
  if (t.id === 'upMode') { UI.U.mode = t.value; updatePreview(); return; }
  if (t.id === 'waMonth') { UI.wa.month = t.value; UI.wa.text = null; render(); return; }
  if (t.id === 'cmpA' || t.id === 'cmpB') { UI.cmp[t.id === 'cmpA' ? 'a' : 'b'] = t.value; render(); return; }
  if (t.dataset.wasel) { const s = UI.wa.sel, i = s.indexOf(t.dataset.wasel); if (t.checked && i < 0) s.push(t.dataset.wasel); if (!t.checked && i >= 0) s.splice(i, 1); return; }
  if (t.dataset.monthnote) { const r = recOf(t.dataset.monthnote); if (r) { r.note = t.value; await save(); toast('Note saved ✓'); } return; }
  if (t.dataset.bind) {
    let v = t.value;
    if (t.dataset.type === 'number') { v = parseFloat(v); if (isNaN(v) || (t.dataset.bind === 'settings.rate' && v <= 0)) { toast('Enter a valid number'); render(); return; } }
    setP(t.dataset.bind, v);
    await save();
    if (t.dataset.bind === 'settings.theme') applyTheme();
    if (/reminderTime|followUps/.test(t.dataset.bind)) Reminders.reschedule(false);
    if (t.dataset.bind === 'settings.tenant') $('#sub').textContent = S.settings.tenant;
    toast('Saved ✓');
  }
});
$('#restoreIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== 'submeter-bill' || !j.state) throw new Error('Not a SubMeter backup file');
    if (!confirm('Restore this backup? Current data on this phone will be replaced.')) return;
    for (const k of await DB.keys()) if (String(k).startsWith('photo:')) await DB.del(k);
    for (const k of Object.keys(j.photos || {})) await DB.set(k, j.photos[k]);
    await DB.set('state', j.state);
    location.reload();
  } catch (err) { toast('Restore failed: ' + err.message); }
  e.target.value = '';
});

function applyTheme() { document.body.dataset.theme = S.settings.theme === 'light' ? 'light' : 'dark'; }

function bindNative() {
  const App = plug('App'), LN = plug('LocalNotifications');
  if (App) App.addListener('backButton', () => {
    if (sheetOpen() && !UI.lock) closeSheet();
    else if (UI.tab !== 'home') { UI.tab = 'home'; render(); }
    else App.exitApp();
  });
  if (LN) LN.addListener('localNotificationActionPerformed', ev => {
    const x = ev.notification && ev.notification.extra;
    if (x && x.route === 'upload' && S.settings.setupDone) openUpload();
  });
}

async function init() {
  try {
    await DB.open();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    await loadState();
  } catch (e) { alert('Storage error: ' + e.message); }
  applyTheme(); bindNative(); render();
  if (!S.settings.setupDone) openSetup();
  else Reminders.reschedule(!S.settings.notifAsked).then(() => { if (!S.settings.notifAsked) { S.settings.notifAsked = true; save(); } });
}
init();
