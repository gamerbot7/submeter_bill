// Billing logic tests: node tests/core.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const rd = f => fs.readFileSync(__dirname + '/../www/js/' + f, 'utf8');
const code = rd('util.js') + '\n' + rd('core.js') +
  '\n;({setState,defaultState,computeUnits,prevReadingFor,paidFor,statusFor,recalc,totals,fillTemplate,normPhone,buildCSV,sortedReadings})';
const api = vm.runInNewContext(code, {});
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const fresh = () => {
  const s = api.defaultState();
  s.settings.tenant = 'Ramesh'; s.settings.room = 'Room 2'; s.settings.initialReading = 12450;
  api.setState(s);
  return s;
};
const rec = (s, month, reading, prev, mode = 'normal') => {
  const r = { id: month, month, reading, prevReading: prev, mode, digits: 5, rate: 11, units: 0, amount: 0, confirmedAt: new Date().toISOString(), history: [] };
  api.recalc(r); s.readings.push(r); return r;
};

console.log('Billing tests');
t('spec example: 12450 -> 12780 = 330 units = Rs 3630', () => {
  const s = fresh(); const r = rec(s, '2026-11', 12780, 12450);
  assert.strictEqual(r.units, 330); assert.strictEqual(r.amount, 3630);
});
t('decimal readings are rounded correctly', () => {
  const s = fresh(); const r = rec(s, '2026-11', 12780.3, 12450);
  assert.strictEqual(r.units, 330.3); assert.strictEqual(r.amount, 3633.3);
});
t('meter reset and rollover', () => {
  assert.strictEqual(api.computeUnits(500, 45, 'reset', 5), 45);
  assert.strictEqual(api.computeUnits(99950, 120, 'rollover', 5), 170);
});
t('previous reading chain (initial -> latest earlier month)', () => {
  const s = fresh();
  assert.strictEqual(api.prevReadingFor('2026-10'), 12450);
  rec(s, '2026-10', 12600, 12450);
  assert.strictEqual(api.prevReadingFor('2026-11'), 12600);
  assert.strictEqual(api.prevReadingFor('2026-09'), 12450);
});
t('partial then full payment', () => {
  const s = fresh(); const r = rec(s, '2026-11', 12780, 12450);
  assert.strictEqual(api.statusFor(r), 'Unpaid');
  s.payments.push({ id: 'a', month: '2026-11', amount: 1000, date: '2026-11-05', method: 'Cash' });
  assert.strictEqual(api.statusFor(r), 'Partially Paid');
  assert.strictEqual(api.totals().outstanding, 2630);
  s.payments.push({ id: 'b', month: '2026-11', amount: 2630, date: '2026-11-09', method: 'UPI' });
  assert.strictEqual(api.statusFor(r), 'Paid');
  assert.strictEqual(api.totals().outstanding, 0);
  assert.strictEqual(api.totals().collected, 3630);
});
t('rate change does not alter saved bills', () => {
  const s = fresh(); const r = rec(s, '2026-11', 12780, 12450);
  s.settings.rate = 12;
  assert.strictEqual(r.amount, 3630);
});
t('default WhatsApp template fills every tag', () => {
  const s = fresh(); const r = rec(s, '2026-11', 12780, 12450);
  const msg = api.fillTemplate(s.settings.templates.bill, r);
  ['ELECTRICITY BILL – November 2026', 'Tenant Name: Ramesh', 'Room Number: Room 2', 'Previous Meter Reading: 12,450', 'Current Meter Reading: 12,780', 'Total Units Consumed: 330', 'Electricity Rate: ₹11/unit', 'TOTAL ELECTRICITY AMOUNT: ₹3,630', 'Payment Status: Unpaid'].forEach(x => assert.ok(msg.includes(x), 'missing: ' + x));
  assert.ok(!/\{\w+\}/.test(msg), 'unfilled tag left');
});
t('phone normalisation', () => {
  assert.strictEqual(api.normPhone('98765 43210'), '919876543210');
  assert.strictEqual(api.normPhone('+91 98765-43210'), '919876543210');
  assert.strictEqual(api.normPhone('09876543210'), '919876543210');
});
t('CSV export has header and one row per month', () => {
  const s = fresh(); rec(s, '2026-10', 12600, 12450); rec(s, '2026-11', 12780, 12600);
  assert.strictEqual(api.buildCSV().split('\n').length, 3);
});
console.log(n + ' tests passed');
