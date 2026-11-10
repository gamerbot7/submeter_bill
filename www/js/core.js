/* core.js — storage (IndexedDB), billing logic, templates, CSV. No UI code here. */
const DB = (() => {
  let db;
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('submeter-bill', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
  const run = (mode, fn) => new Promise((res, rej) => {
    const t = db.transaction('kv', mode);
    const rq = fn(t.objectStore('kv'));
    t.oncomplete = () => res(rq.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
  return {
    open,
    get: k => run('readonly', s => s.get(k)),
    set: (k, v) => run('readwrite', s => s.put(v, k)),
    del: k => run('readwrite', s => s.delete(k)),
    keys: () => run('readonly', s => s.getAllKeys())
  };
})();

const defTemplates = {
  bill: 'ELECTRICITY BILL – {month} {year}\n\nTenant Name: {tenant_name}\nRoom Number: {room_number}\n\nPrevious Meter Reading: {previous_reading}\nCurrent Meter Reading: {current_reading}\n\nTotal Units Consumed: {units}\n\nElectricity Rate: ₹{rate}/unit\n\nTOTAL ELECTRICITY AMOUNT: ₹{amount}\n\nPayment Status: {payment_status}\n\nPlease make the electricity payment.\n\nThank you!',
  reminder: 'PAYMENT REMINDER – {month} {year}\n\nHello {tenant_name} ({room_number}),\n\nYour electricity bill of ₹{amount} ({units} units × ₹{rate}) is still pending.\n\nPaid so far: ₹{paid}\nBalance due: ₹{balance}\n\nKindly make the payment soon. Thank you!',
  received: 'PAYMENT RECEIVED – {month} {year}\n\nDear {tenant_name}, we have received ₹{paid} towards the electricity bill for {month} {year}.\n\nBill amount: ₹{amount}\nBalance: ₹{balance}\nStatus: {payment_status}\n\nThank you!',
  custom: 'Hello {tenant_name}, '
};

const defaultState = () => ({
  v: 1,
  settings: {
    tenant: '', room: '', rate: 11, initialReading: 0, initialDate: todayISO(),
    meterDigits: 5, highUsage: 500, reminderTime: '09:00', followUps: 'standard',
    theme: 'dark', setupDone: false, notifAsked: false,
    templates: { ...defTemplates }
  },
  contacts: [],   // {id,name,phone}  (max 5)
  readings: [],   // one per month — see confirmReading in app.js
  payments: [],   // {id,month,amount,date,method,note}
  notes: {},      // 'YYYY-MM-DD' -> text
  messages: []    // WhatsApp log
});

let S = defaultState();
function setState(s) { S = s; }
async function loadState() {
  const saved = await DB.get('state');
  const d = defaultState();
  if (saved) {
    S = { ...d, ...saved, settings: { ...d.settings, ...(saved.settings || {}), templates: { ...d.settings.templates, ...((saved.settings || {}).templates || {}) } } };
  } else S = d;
}
const save = () => DB.set('state', JSON.parse(JSON.stringify(S)));

/* ---------- billing ---------- */
const sortedReadings = () => [...S.readings].sort((a, b) => a.month.localeCompare(b.month));
const hasReading = k => S.readings.some(r => r.month === k);
function prevReadingFor(month) {
  const before = sortedReadings().filter(r => r.month < month);
  return before.length ? before[before.length - 1].reading : Number(S.settings.initialReading) || 0;
}
// mode: normal | reset (meter restarted from 0) | rollover (meter passed its max digits)
function computeUnits(prev, cur, mode, digits) {
  if (mode === 'reset') return cur;
  if (mode === 'rollover') return Math.pow(10, digits || 5) - prev + cur;
  return cur - prev;
}
function recalc(rec) {
  rec.units = round2(computeUnits(rec.prevReading, rec.reading, rec.mode, rec.digits || S.settings.meterDigits));
  rec.amount = round2(rec.units * rec.rate);
}
const paidFor = month => round2(S.payments.filter(p => p.month === month).reduce((a, p) => a + p.amount, 0));
function statusFor(r) {
  const paid = paidFor(r.month);
  if (paid <= 0) return 'Unpaid';
  if (paid + 0.005 >= r.amount) return 'Paid';
  return 'Partially Paid';
}
function totals(rs = S.readings) {
  let billed = 0, collected = 0, outstanding = 0;
  rs.forEach(r => { const p = paidFor(r.month); billed += r.amount; collected += p; outstanding += Math.max(0, r.amount - p); });
  return { billed: round2(billed), collected: round2(collected), outstanding: round2(outstanding) };
}

/* ---------- messages ---------- */
function fillTemplate(t, r) {
  const rec = r || { month: monthKey(), prevReading: 0, reading: 0, units: 0, rate: S.settings.rate, amount: 0 };
  const paid = paidFor(rec.month);
  const d = mDate(rec.month);
  const map = {
    month: MONTHS[d.getMonth()], year: d.getFullYear(),
    tenant_name: S.settings.tenant, room_number: S.settings.room,
    previous_reading: fmtNum(rec.prevReading), current_reading: fmtNum(rec.reading),
    units: fmtNum(rec.units), rate: fmtNum(rec.rate), amount: fmtNum(rec.amount),
    payment_status: r ? statusFor(rec) : '', paid: fmtNum(paid), balance: fmtNum(Math.max(0, rec.amount - paid))
  };
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}

/* ---------- export ---------- */
function buildCSV() {
  const rows = [['Month', 'Previous reading', 'Current reading', 'Units', 'Rate', 'Amount', 'Paid', 'Balance', 'Status', 'Payment dates', 'Methods', 'Confirmed on', 'Note']];
  sortedReadings().forEach(r => {
    const ps = S.payments.filter(p => p.month === r.month), paid = paidFor(r.month);
    rows.push([monthLabel(r.month), r.prevReading, r.reading, r.units, r.rate, r.amount, paid, Math.max(0, round2(r.amount - paid)), statusFor(r), ps.map(p => p.date).join('; '), ps.map(p => p.method).join('; '), (r.confirmedAt || '').slice(0, 10), r.note || '']);
  });
  return '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
}
