/* util.js — small helpers shared by every file */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad = n => String(n).padStart(2, '0');
const monthKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const mDate = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1); };
const monthLabel = k => { const d = mDate(k); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmtNum = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtINR = n => '₹' + fmtNum(n);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image load failed')); i.src = src; });

let _toastT;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
