const test = require('node:test');
const assert = require('node:assert/strict');
const { indexedDB } = require('fake-indexeddb');
const S = require('../src/store.js');

let n = 0;
const NOW = new Date('2026-10-09T18:00:00.000Z');
const open = (extra) => S.openStore({ indexedDB, name: 'test-' + (++n), now: () => NOW, storage: null, ...extra });
const sh = (date, from = '22:00', till = '06:30') => ({ date, from, till, breakMin: 30, breakStart: null, status: 'worked', note: '' });

test('a new store is empty with default meta', async () => {
  const s = await open();
  const all = await s.getAll();
  assert.deepEqual(all.shifts, {});
  assert.deepEqual(all.payslips, {});
  assert.equal(all.settings, null);
  assert.deepEqual(all.meta, S.DEFAULT_META);
});
test('putShift saves the shift and stamps lastChangeAt', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  const all = await s.getAll();
  assert.deepEqual(all.shifts['2026-10-05'], sh('2026-10-05'));
  assert.equal(all.meta.lastChangeAt, '2026-10-09T18:00:00.000Z');
});
test('delete, payslips and settings round trip', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  await s.deleteShift('2026-10-05');
  await s.putPayslip({ month: '2026-10', grossTotal: 1 });
  await s.putSettings({ nightPct: 25 });
  let all = await s.getAll();
  assert.deepEqual(all.shifts, {});
  assert.equal(all.payslips['2026-10'].grossTotal, 1);
  assert.deepEqual(all.settings, { nightPct: 25 });
  await s.deletePayslip('2026-10');
  all = await s.getAll();
  assert.deepEqual(all.payslips, {});
});
test('setMeta merges and does not count as a data change', async () => {
  const s = await open();
  await s.setMeta({ onboarded: true, lastBackupAt: '2026-10-01T00:00:00.000Z' });
  const m = await s.getMeta();
  assert.equal(m.onboarded, true);
  assert.equal(m.lastBackupAt, '2026-10-01T00:00:00.000Z');
  assert.equal(m.lastChangeAt, null);
});
test('replaceAll replaces shifts and payslips; a backup without settings keeps the current settings', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  await s.putSettings({ nightPct: 30 });
  await s.replaceAll({ shifts: { '2026-10-06': sh('2026-10-06') }, payslips: {}, settings: null });
  const all = await s.getAll();
  assert.deepEqual(Object.keys(all.shifts), ['2026-10-06']);
  assert.deepEqual(all.settings, { nightPct: 30 });
});
test('saveUndo → replaceAll → restoreUndo brings back exactly the old data', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  await s.saveUndo();
  assert.equal(await s.hasUndo(), true);
  await s.replaceAll({ shifts: { '2026-10-06': sh('2026-10-06') }, payslips: { '2026-10': { month: '2026-10' } }, settings: { nightPct: 99 } });
  assert.equal(await s.restoreUndo(), true);
  const all = await s.getAll();
  assert.deepEqual(Object.keys(all.shifts), ['2026-10-05']);
  assert.deepEqual(all.payslips, {});
  assert.equal(all.settings, null);
  assert.equal(await s.hasUndo(), false);
  assert.equal(await s.restoreUndo(), false);
});
test('data survives closing and reopening the database', async () => {
  const name = 'reopen-' + (++n);
  const a = await S.openStore({ indexedDB, name, storage: null });
  await a.putShift(sh('2026-10-05'));
  a.close();
  const b = await S.openStore({ indexedDB, name, storage: null });
  assert.ok((await b.getAll()).shifts['2026-10-05']);
});
test('no IndexedDB at all rejects with code no-idb', async () => {
  await assert.rejects(S.openStore({ indexedDB: null, storage: null }), (e) => e.code === 'no-idb');
});
test('persistent storage: asks the storage manager; null when there is none', async () => {
  const yes = await open({ storage: { persist: async () => true, persisted: async () => true } });
  assert.equal(await yes.requestPersist(), true);
  assert.equal(await yes.isPersisted(), true);
  const none = await open({ storage: null });
  assert.equal(await none.requestPersist(), null);
  assert.equal(await none.isPersisted(), null);
});
test('a write that fails rejects with code write-failed and changes nothing', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  const before = await s.getAll();
  await assert.rejects(s.putShift({ from: '22:00' }), (e) => e.code === 'write-failed');
  await assert.rejects(s.putPayslip({ month: '2026-10', bad: () => 1 }), (e) => e.code === 'write-failed');
  assert.deepEqual(await s.getAll(), before);
});
test('migration v0→v1 creates every table from an empty database', async () => {
  const name = 'migrate-' + (++n);
  (await S.openStore({ indexedDB, name, storage: null })).close();
  const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  assert.equal(db.version, S.DB_VERSION);
  assert.deepEqual([...db.objectStoreNames].sort(), ['meta', 'payslips', 'settings', 'shifts', 'undo']);
  const t = db.transaction(['shifts', 'payslips'], 'readonly');
  assert.equal(t.objectStore('shifts').keyPath, 'date');
  assert.equal(t.objectStore('payslips').keyPath, 'month');
  db.close();
});
