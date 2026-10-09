// Acceptance + unit tests for the calc engine. Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/calc.js');

const S = () => C.defaultSettings();
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const shift = (date, from, till, extra = {}) =>
  ({ date, from, till, breakMin: 30, breakStart: null, status: 'worked', note: '', ...extra });

// ---------- Step 1: calcShift ----------

test('T1 Mon 05.10 22:00–06:30: 8.00 paid, 6.50 night, bonus 24.91, gross 147.55', () => {
  const r = C.calcShift(shift('2026-10-05', '22:00', '06:30'), S());
  assert.equal(r.paidH, 8);
  assert.equal(r.nightH, 6.5);
  assert.equal(r2(r.premium), 24.91);
  assert.equal(r2(r.gross), 147.55);
  assert.equal(r.rate, 15.33);
});

test('break is centred on the midpoint: 22:00–06:30 → 02:00–02:30', () => {
  const r = C.calcShift(shift('2026-10-05', '22:00', '06:30'), S());
  assert.equal(r.breakFrom, '02:00');
  assert.equal(r.breakTill, '02:30');
});

test('T2 Thu 08.10 23:15–06:30: 6.75 paid, 6.25 night, bonus 23.95, gross 127.43', () => {
  const r = C.calcShift(shift('2026-10-08', '23:15', '06:30'), S());
  assert.equal(r.paidH, 6.75);
  assert.equal(r.nightH, 6.25);
  assert.equal(r2(r.premium), 23.95);
  assert.equal(r2(r.gross), 127.43);
});

test('T3 Fri 09.10 23:30–06:30: 6.50 paid, 6.00 night, bonus 23.00, gross 122.64', () => {
  const r = C.calcShift(shift('2026-10-09', '23:30', '06:30'), S());
  assert.equal(r.paidH, 6.5);
  assert.equal(r.nightH, 6);
  assert.equal(r2(r.premium), 23.0);
  assert.equal(r2(r.gross), 122.64);
});

test('T5 Sat→Sun 10.10: 1 h night@25 + 6 h Sunday@50 (max, not 75) → 49.82 / 172.46', () => {
  const r = C.calcShift(shift('2026-10-10', '22:00', '06:30'), S());
  assert.equal(r.paidH, 8);
  assert.equal(r.nightH, 1);
  assert.equal(r.sundayH, 6);
  assert.equal(r2(r.premium), 49.82);
  assert.equal(r2(r.gross), 172.46);
});

test('T6 Sun→Mon 11.10: 2 h Sunday@50 + 5.5 h night@25 → 36.41 / 159.05', () => {
  const r = C.calcShift(shift('2026-10-11', '22:00', '06:30'), S());
  assert.equal(r.sundayH, 2);
  assert.equal(r.nightH, 5.5);
  assert.equal(r2(r.premium), 36.41);
  assert.equal(r2(r.gross), 159.05);
});

test('T7 Christmas 24.12 22:00–06:30: 8 h @100 (eve then holiday) → 122.64 / 245.28', () => {
  const r = C.calcShift(shift('2026-12-24', '22:00', '06:30'), S());
  assert.equal(r.paidH, 8);
  assert.equal(r.eveH, 2);
  assert.equal(r.holidayH, 6);
  assert.equal(r.nightH, 0);
  assert.equal(r2(r.premium), 122.64);
  assert.equal(r2(r.gross), 245.28);
  assert.equal(r2(r.premiumBreakdown.holiday + r.premiumBreakdown.eve), 122.64);
});

test('T9 overnight parse: from 23:00 till 23:00 → 24 h span with warnings', () => {
  const r = C.calcShift(shift('2026-10-05', '23:00', '23:00'), S());
  assert.equal(r.spanH, 24);
  assert.equal(r.paidH, 23.5);
  assert.ok(r.warnings.some((w) => w.code === 'same-time'));
  assert.ok(r.warnings.some((w) => w.code === 'over-10h'));
});

test('premium breakdown categories sum to premium', () => {
  const r = C.calcShift(shift('2026-10-10', '22:00', '06:30'), S());
  const b = r.premiumBreakdown;
  assert.equal(r2(b.night + b.sunday + b.holiday + b.eve), r2(r.premium));
});

test('explicit breakStart is used instead of midpoint', () => {
  // break 22:00–22:30 on Sat→Sun moves the gap out of the Sunday window: 6.5 Sunday h
  const r = C.calcShift(shift('2026-10-10', '22:00', '06:30', { breakStart: '22:00' }), S());
  assert.equal(r.breakFrom, '22:00');
  assert.equal(r.sundayH, 6.5);
  assert.equal(r.nightH, 1);
});

test('breakPaid=true keeps break minutes paid', () => {
  const r = C.calcShift(shift('2026-10-05', '22:00', '06:30'), { ...S(), breakPaid: true });
  assert.equal(r.paidH, 8.5);
});

test('rate comes from ratePeriods by start date (15.87 from 2027-04-01)', () => {
  const r = C.calcShift(shift('2027-04-01', '08:00', '12:00', { breakMin: 0 }), S());
  assert.equal(r.rate, 15.87);
});

test('warning: break under 30 min on a shift over 6 h', () => {
  const r = C.calcShift(shift('2026-10-05', '22:00', '06:30', { breakMin: 15 }), S());
  assert.ok(r.warnings.some((w) => w.code === 'break-short'));
});

test('warning: break under 45 min on a shift over 9 h', () => {
  const r = C.calcShift(shift('2026-10-05', '20:00', '06:00', { breakMin: 30 }), S());
  assert.ok(r.warnings.some((w) => w.code === 'break-short'));
  const ok = C.calcShift(shift('2026-10-05', '22:00', '06:30'), S());
  assert.equal(ok.warnings.length, 0);
});

test('warning: under 11 h rest since the previous shift', () => {
  const prev = shift('2026-10-05', '22:00', '06:30');
  const r = C.calcShift(shift('2026-10-06', '16:00', '22:00'), S(), prev);
  assert.ok(r.warnings.some((w) => w.code === 'rest'));
  const fine = C.calcShift(shift('2026-10-06', '22:00', '06:30'), S(), prev);
  assert.ok(!fine.warnings.some((w) => w.code === 'rest'));
});

test('non-worked status yields zero pay', () => {
  const r = C.calcShift({ date: '2026-10-07', status: 'dayoff' }, S());
  assert.equal(r.paidH, 0);
  assert.equal(r.gross, 0);
});

test('DST end (25.10.2026): 22:00–06:30 is 9 real hours on the clock-change night', () => {
  const r = C.calcShift(shift('2026-10-24', '22:00', '06:30'), S());
  assert.equal(r.spanH, 9.5);
  assert.equal(r.paidH, 9);
});

// ---------- Step 2: aggregation ----------
const SEED = [
  shift('2026-10-05', '22:00', '06:30'),
  shift('2026-10-06', '22:00', '06:30'),
  { date: '2026-10-07', from: '', till: '', breakMin: 30, breakStart: null, status: 'dayoff', note: '' },
  shift('2026-10-08', '23:15', '06:30'),
  shift('2026-10-09', '23:30', '06:30'),
];

test('isoWeek: 05.10.2026 is 2026-W41 (Mon–Sun), Sun 11.10 still W41, Mon 12.10 W42', () => {
  assert.equal(C.isoWeek('2026-10-05').key, '2026-W41');
  assert.equal(C.isoWeek('2026-10-11').key, '2026-W41');
  assert.equal(C.isoWeek('2026-10-12').key, '2026-W42');
  assert.equal(C.isoWeek('2026-10-05').monday, '2026-10-05');
  assert.equal(C.isoWeek('2027-01-01').key, '2026-W53');
});

test('T4 week 41 totals: 4 shifts, 29.25 h, 25.25 night h, bonus 96.77, gross 545.17', () => {
  const weeks = C.weekTotals(C.calcAll(SEED, S()));
  const w = weeks['2026-W41'];
  assert.equal(w.shifts, 4);
  assert.equal(w.paidH, 29.25);
  assert.equal(w.nightH, 25.25);
  assert.equal(r2(w.premium), 96.77);
  assert.equal(r2(w.premiumBreakdown.night), 96.77);
  assert.equal(r2(w.base), 448.40);
  assert.equal(r2(w.gross), 545.17);
  assert.equal(r2(w.avgPerH), r2(545.173125 / 29.25));
});

test('month totals bucket by start date: 31.10 night shift counts in October', () => {
  const list = [...SEED, shift('2026-10-31', '22:00', '06:30')];
  const months = C.monthTotals(C.calcAll(list, S()));
  assert.equal(months['2026-10'].shifts, 5);
  assert.equal(months['2026-10'].paidH, 37.25);
  assert.equal(months['2026-11'], undefined);
});

test('calcAll sorts by date and feeds the previous worked shift for the rest check', () => {
  const list = [shift('2026-10-06', '16:00', '22:00'), shift('2026-10-05', '22:00', '06:30')];
  const all = C.calcAll(list, S());
  assert.equal(all[0].shift.date, '2026-10-05');
  assert.ok(all[1].r.warnings.some((w) => w.code === 'rest'));
});

// ---------- Step 3: time account + expected payslip ----------
test('T8 October target = 100.35 × 27/31 = 87.41 h', () => {
  assert.equal(r2(C.monthTarget('2026-10', S())), 87.41);
});

test('full months use weeklyHours × weeksPerMonth (100.35 h); months outside the assignment are 0', () => {
  assert.equal(r2(C.monthTarget('2026-11', S())), 100.35);
  assert.equal(r2(C.monthTarget('2026-12', S())), 100.35);
  assert.equal(C.monthTarget('2027-01', S()), 0);
});

test('monthTargetOverride wins', () => {
  const s = { ...S(), monthTargetOverride: { '2026-10': 86 } };
  assert.equal(C.monthTarget('2026-10', s), 86);
});

test('time account: October with the seed week → delta −58.16, balance −58.16; cap ≈ 131.8', () => {
  const ta = C.timeAccount(C.calcAll(SEED, S()), S(), '2026-10');
  assert.equal(ta.rows.length, 1);
  const oct = ta.rows[0];
  assert.equal(oct.ym, '2026-10');
  assert.equal(oct.workedH, 29.25);
  assert.equal(r2(oct.delta), -58.16);
  assert.equal(r2(oct.balance), -58.16);
  assert.equal(Math.round(ta.cap * 10) / 10, 131.8);
});

test('time account: running balance carries across months; sick/vacation days credit weeklyHours/5', () => {
  const list = [...SEED, { date: '2026-11-02', status: 'sick' }, shift('2026-11-03', '08:00', '16:30')];
  const ta = C.timeAccount(C.calcAll(list, S()), S(), '2026-11');
  const nov = ta.rows[1];
  assert.equal(r2(nov.workedH), r2(8 + 23.07 / 5));
  assert.equal(r2(nov.balance), r2(ta.rows[0].delta + nov.delta));
});

test('expected payslip October (seed): fixed 1339.93 + bonuses 96.77 = 1436.70; earned value 545.17', () => {
  const p = C.expectedPayslip('2026-10', C.calcAll(SEED, S()), S());
  assert.equal(r2(p.target), 87.41);
  assert.equal(r2(p.fixedPay), 1339.93);
  assert.equal(r2(p.bonuses), 96.77);
  assert.equal(p.overtimeH, 0);
  assert.equal(p.overtimeEst, 0);
  assert.equal(r2(p.expectedGross), 1436.70);
  assert.equal(r2(p.earnedValue), 545.17);
  // the gap equals the time-account change × rate
  assert.equal(r2(p.earnedValue - p.expectedGross), r2((29.25 - p.target) * 15.33));
});

// 16 weekday day shifts in November 2026, 8 paid h each = 128 h
const NOV_DAYS = ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '23'];
const novDay = NOV_DAYS.map((d) => shift('2026-11-' + d, '08:00', '16:30'));

test('overtime estimate: 128 h vs threshold 115.41 → 12 full hours × 25 % = 45.99', () => {
  const p = C.expectedPayslip('2026-11', C.calcAll(novDay, S()), S());
  assert.equal(r2(p.threshold), 115.41);
  assert.equal(p.overtimeH, 12);
  assert.equal(r2(p.overtimeEst), 45.99);
  assert.equal(r2(p.expectedGross), r2(100.3545 * 15.33 + 45.99));
});

test('overtime estimate respects §6.4: last hours already at night 25 % get no extra', () => {
  const list = [...novDay.slice(0, 15), shift('2026-11-23', '22:00', '06:30')];
  const p = C.expectedPayslip('2026-11', C.calcAll(list, S()), S());
  assert.equal(p.overtimeH, 12);
  // last 12 h = whole night shift (1.5 h at 0 %, 6.5 h night) + 4 h of the day shift before → 5.5 h × 25 %
  assert.equal(r2(p.overtimeEst), 21.08);
});

// ---------- Step 4: net estimate + calibration ----------
test('netEstimate: (gross − tax-free) × ratio + tax-free', () => {
  assert.equal(r2(C.netEstimate(1500, 100, 0.8)), 1220);
});

test('calibration: netRatio = (net − tax-free) / (gross − tax-free) and flags calibrated', () => {
  const s = C.calibrate(S(), { grossTotal: 1500, netTotal: 1200 }, 100);
  assert.equal(s.netRatio, 1100 / 1400);
  assert.equal(s.netRatioCalibrated, true);
  assert.equal(S().netRatioCalibrated, false); // defaults untouched
});

test('calibration ignores incomplete payslips', () => {
  const s = C.calibrate(S(), { grossTotal: 0, netTotal: 0 }, 0);
  assert.equal(s.netRatio, 0.8);
  assert.equal(s.netRatioCalibrated, false);
});

test('week 41 est. net at 0.80 = 455.49 (all bonuses tax-free)', () => {
  const w = C.weekTotals(C.calcAll(SEED, S()), S())['2026-W41'];
  assert.equal(r2(w.net), 455.49);
});

test('expected payslip October: tax-free 96.77, est. net 1168.71; overtime bonus stays taxable', () => {
  const p = C.expectedPayslip('2026-10', C.calcAll(SEED, S()), S());
  assert.equal(r2(p.taxFree), 96.77);
  assert.equal(r2(p.expectedNet), 1168.71);
  const q = C.expectedPayslip('2026-11', C.calcAll(novDay, S()), S());
  assert.equal(q.taxFree, 0);
  assert.equal(r2(q.expectedNet), r2(q.expectedGross * 0.8));
});

// ---------- Step 7 support: daily balance line ----------
test('dailyBalance: target accrues per assignment day; 05.10 after T1 = 8 − 87.41/27 = 4.76', () => {
  const pts = C.dailyBalance(C.calcAll(SEED, S()), S(), '2026-10-31');
  assert.equal(pts[0].date, '2026-10-05');
  assert.equal(r2(pts[0].balance), r2(8 - 100.3545 * 27 / 31 / 27));
  assert.equal(pts.length, 27);
  // month end equals the monthly time-account balance
  const ta = C.timeAccount(C.calcAll(SEED, S()), S(), '2026-10');
  assert.equal(r2(pts[26].balance), r2(ta.balance));
});

test('runs: T1 timeline is base 60 / bonus 180 / break 30 / bonus 210 / base 30 (minutes from start)', () => {
  const r = C.calcShift(shift('2026-10-05', '22:00', '06:30'), S());
  assert.deepEqual(r.runs.map((x) => [x.kind, x.start, x.len]), [['b', 0, 60], ['p', 60, 180], ['gap', 240, 30], ['p', 270, 210], ['b', 480, 30]]);
});
