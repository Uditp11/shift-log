const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/backup.js');
const C = require('../src/calc.js');

const sh = (date, from, till, status = 'worked') => ({ date, from, till, breakMin: 30, breakStart: null, status, note: '' });
const DATA = {
  shifts: { '2026-10-05': sh('2026-10-05', '22:00', '06:30'), '2026-10-07': sh('2026-10-07', '', '', 'dayoff') },
  payslips: { '2026-10': { month: '2026-10', grossTotal: 1436.7, netTotal: 1168.71, hoursPaid: 87.41, premiumsPaid: null, timeAccountBalance: null, note: '' } },
  settings: { ...C.defaultSettings(), lang: 'de' },
};
const NOW = new Date('2026-10-09T18:30:00.000Z');

test('build → parse round trip returns identical data and a summary', () => {
  const file = B.buildBackup(DATA, NOW, '1.0.0');
  assert.equal(file.format, 'shift-log-backup');
  assert.equal(file.version, 1);
  assert.equal(file.exportedAt, '2026-10-09T18:30:00.000Z');
  assert.deepEqual(file.shifts.map((s) => s.date), ['2026-10-05', '2026-10-07']);
  const r = B.parseBackup(JSON.stringify(file));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, DATA);
  assert.deepEqual(r.summary, { shifts: 2, payslips: 1, first: '2026-10-05', last: '2026-10-07', exportedAt: '2026-10-09T18:30:00.000Z' });
});
test('refuses text that is not JSON', () => {
  assert.deepEqual(B.parseBackup('not json {'), { ok: false, code: 'bad-json', detail: '' });
});
test('refuses JSON that is not a Shift Log backup', () => {
  assert.equal(B.parseBackup('{"hello":1}').code, 'wrong-format');
  assert.equal(B.parseBackup('[1,2]').code, 'wrong-format');
  assert.equal(B.parseBackup('null').code, 'wrong-format');
});
test('refuses a backup from a newer version', () => {
  const file = { ...B.buildBackup(DATA, NOW, '9.0.0'), version: 2 };
  assert.equal(B.parseBackup(JSON.stringify(file)).code, 'newer-version');
});
test('refuses a broken shift and names it', () => {
  const file = B.buildBackup(DATA, NOW, '1.0.0');
  file.shifts[0].till = '25:00';
  const r = B.parseBackup(JSON.stringify(file));
  assert.equal(r.code, 'bad-record');
  assert.match(r.detail, /2026-10-05/);
});
test('refuses a broken payslip month', () => {
  const file = B.buildBackup(DATA, NOW, '1.0.0');
  file.payslips[0].month = 'Oct';
  assert.equal(B.parseBackup(JSON.stringify(file)).code, 'bad-record');
});
test('accepts the Claude artifact shapes: {id, data} rows and objects keyed by id', () => {
  const rows = {
    format: 'shift-log-backup', version: 1, exportedAt: NOW.toISOString(), settings: null,
    shifts: [{ id: '2026-10-05', data: { from: '22:00', till: '06:30', breakMin: 30, breakStart: null, status: 'worked', note: '' }, version: 1 }],
    payslips: { '2026-10': { grossTotal: 1, netTotal: 1, hoursPaid: null, premiumsPaid: null, timeAccountBalance: null, note: '' } },
  };
  const r = B.parseBackup(JSON.stringify(rows));
  assert.equal(r.ok, true);
  assert.equal(r.data.shifts['2026-10-05'].date, '2026-10-05');
  assert.equal(r.data.payslips['2026-10'].month, '2026-10');
  assert.equal(r.data.settings, null);
});
test('mergeMissing adds only absent shifts/payslips and keeps current settings', () => {
  const current = { shifts: { '2026-10-05': sh('2026-10-05', '23:00', '06:30') }, payslips: {}, settings: { a: 1 } };
  const incoming = { shifts: { '2026-10-05': sh('2026-10-05', '22:00', '06:30'), '2026-10-06': sh('2026-10-06', '22:00', '06:30') }, payslips: { '2026-10': DATA.payslips['2026-10'] }, settings: { a: 2 } };
  const m = B.mergeMissing(current, incoming);
  assert.equal(m.shifts['2026-10-05'].from, '23:00');
  assert.ok(m.shifts['2026-10-06']);
  assert.ok(m.payslips['2026-10']);
  assert.deepEqual(m.settings, { a: 1 });
});
test('backupFileName uses the local date', () => {
  assert.equal(B.backupFileName(new Date(2026, 9, 9, 23, 50)), 'shift-log-backup-2026-10-09.json');
});
test('mergeSettings: settings saved by an older version get the new keys from defaults', () => {
  const defaults = B.appDefaults(C.defaultSettings(), 'de');
  const old = { ...C.defaultSettings(), nightPct: 30 };
  const s = B.mergeSettings(old, defaults);
  assert.equal(s.nightPct, 30);
  assert.equal(s.lang, 'de');
  assert.equal(s.backupReminderDays, 7);
  assert.equal(s.jobLabel, 'Lagerhelfer · Deutsche Post Obertshausen · via Adecco');
});
test('mergeSettings keeps absenceCreditH, repairs empty ratePeriods and a missing override map', () => {
  const defaults = B.appDefaults(C.defaultSettings(), 'en');
  const s = B.mergeSettings({ absenceCreditH: 5, ratePeriods: [], monthTargetOverride: null, junk: 1 }, defaults);
  assert.equal(s.absenceCreditH, 5);
  assert.equal(s.ratePeriods.length, 2);
  assert.deepEqual(s.monthTargetOverride, {});
  assert.equal('junk' in s, false);
  assert.equal(B.mergeSettings(null, defaults).lang, 'en');
});

const D = 86400000;
const meta = (lastBackupAt, lastChangeAt) => ({ lastBackupAt, lastChangeAt });
test('backupDue: never backed up → due once there are 3 shifts', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.equal(B.backupDue(meta(null, now.toISOString()), { backupReminderDays: 7 }, 2, now), false);
  assert.deepEqual(B.backupDue(meta(null, now.toISOString()), { backupReminderDays: 7 }, 3, now), { never: true });
  assert.equal(B.backupDue(meta(null, null), { backupReminderDays: 7 }, 0, now), false);
});
test('backupDue: due only when there were changes since the last backup and it is older than the reminder days', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const old = new Date(now - 8 * D).toISOString(), recent = new Date(now - 2 * D).toISOString(), changed = new Date(now - 1 * D).toISOString();
  assert.deepEqual(B.backupDue(meta(old, changed), { backupReminderDays: 7 }, 10, now), { never: false });
  assert.equal(B.backupDue(meta(recent, changed), { backupReminderDays: 7 }, 10, now), false);
  assert.equal(B.backupDue(meta(old, new Date(now - 9 * D).toISOString()), { backupReminderDays: 7 }, 10, now), false);
});
