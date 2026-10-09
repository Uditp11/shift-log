/* On-device persistence (IndexedDB). Every write also stamps meta.lastChangeAt in the same transaction.
 * Works in the browser (window.Store) and in Node tests with an injected indexedDB (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Store = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DB_NAME = 'shift-log';
  const DB_VERSION = 1;
  const DEFAULT_META = { schemaVersion: 1, onboarded: false, lastBackupAt: null, lastChangeAt: null, persistAsked: false };

  // MIGRATIONS[v] upgrades a database from version v to v+1. Never edit a shipped entry; append a new one.
  const MIGRATIONS = [
    (db) => {
      db.createObjectStore('shifts', { keyPath: 'date' });
      db.createObjectStore('payslips', { keyPath: 'month' });
      db.createObjectStore('settings');
      db.createObjectStore('meta');
      db.createObjectStore('undo');
    },
  ];

  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function txDone(t) {
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaction aborted'));
    });
  }
  function storeError(e) {
    const err = new Error((e && e.message) || 'Storage error');
    err.code = e && e.name === 'QuotaExceededError' ? 'quota' : 'write-failed';
    err.cause = e;
    return err;
  }
  function noIdb(cause) { return Object.assign(new Error('IndexedDB unavailable'), { code: 'no-idb', cause }); }

  function openStore(opts) {
    opts = opts || {};
    const idb = 'indexedDB' in opts ? opts.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
    const now = opts.now || (() => new Date());
    const storage = 'storage' in opts ? opts.storage : (typeof navigator !== 'undefined' ? navigator.storage : undefined);
    if (!idb) return Promise.reject(noIdb());
    return new Promise((resolve, reject) => {
      let r;
      try { r = idb.open(opts.name || DB_NAME, DB_VERSION); } catch (e) { reject(noIdb(e)); return; }
      r.onupgradeneeded = (e) => { for (let v = e.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](r.result, r.transaction); };
      r.onsuccess = () => resolve(makeApi(r.result, now, storage));
      r.onerror = () => reject(noIdb(r.error));
    });
  }

  function makeApi(db, now, storage) {
    db.onversionchange = () => db.close();
    const ALL = ['shifts', 'payslips', 'settings', 'meta'];

    function touch(t) {
      const m = t.objectStore('meta');
      const g = m.get('meta');
      g.onsuccess = () => m.put({ ...DEFAULT_META, ...(g.result || {}), lastChangeAt: now().toISOString() }, 'meta');
    }
    async function write(names, fn, stamp) {
      let t;
      try {
        t = db.transaction(stamp === false ? names : names.concat('meta'), 'readwrite');
        const done = txDone(t);
        done.catch(() => {}); // if fn throws, we abort below and rethrow; don't leave this rejection unhandled
        fn(t);
        if (stamp !== false) touch(t);
        await done;
      } catch (e) {
        try { if (t) t.abort(); } catch (e2) { /* already finished */ }
        throw storeError(e);
      }
    }
    // settingsMode: 'keep' leaves settings alone when data.settings is null; 'exact' deletes them.
    function fill(t, data, settingsMode) {
      const shifts = t.objectStore('shifts'), payslips = t.objectStore('payslips'), settings = t.objectStore('settings');
      shifts.clear(); payslips.clear();
      for (const s of Object.values(data.shifts || {})) shifts.put(s);
      for (const p of Object.values(data.payslips || {})) payslips.put(p);
      if (data.settings) settings.put(data.settings, 'settings');
      else if (settingsMode === 'exact') settings.delete('settings');
    }

    async function getAll() {
      const t = db.transaction(ALL, 'readonly');
      const [sh, ps, st, me] = await Promise.all([
        reqP(t.objectStore('shifts').getAll()), reqP(t.objectStore('payslips').getAll()),
        reqP(t.objectStore('settings').get('settings')), reqP(t.objectStore('meta').get('meta')),
      ]);
      const shifts = {}, payslips = {};
      for (const s of sh) shifts[s.date] = s;
      for (const p of ps) payslips[p.month] = p;
      return { shifts, payslips, settings: st || null, meta: { ...DEFAULT_META, ...(me || {}) } };
    }
    async function getMeta() {
      const t = db.transaction(['meta'], 'readonly');
      return { ...DEFAULT_META, ...((await reqP(t.objectStore('meta').get('meta'))) || {}) };
    }
    function setMeta(patch) {
      return write(['meta'], (t) => {
        const m = t.objectStore('meta');
        const g = m.get('meta');
        g.onsuccess = () => m.put({ ...DEFAULT_META, ...(g.result || {}), ...patch }, 'meta');
      }, false);
    }
    async function hasUndo() {
      const t = db.transaction(['undo'], 'readonly');
      return !!(await reqP(t.objectStore('undo').get('beforeRestore')));
    }
    async function saveUndo() {
      const snap = await getAll();
      await write(['undo'], (t) => t.objectStore('undo').put(
        { shifts: snap.shifts, payslips: snap.payslips, settings: snap.settings, takenAt: now().toISOString() }, 'beforeRestore'), false);
    }
    async function restoreUndo() {
      const t0 = db.transaction(['undo'], 'readonly');
      const snap = await reqP(t0.objectStore('undo').get('beforeRestore'));
      if (!snap) return false;
      await write(['shifts', 'payslips', 'settings', 'undo'], (t) => {
        fill(t, snap, 'exact');
        t.objectStore('undo').delete('beforeRestore');
      });
      return true;
    }
    async function requestPersist() {
      if (!storage || typeof storage.persist !== 'function') return null;
      try { return !!(await storage.persist()); } catch (e) { return false; }
    }
    async function isPersisted() {
      if (!storage || typeof storage.persisted !== 'function') return null;
      try { return !!(await storage.persisted()); } catch (e) { return null; }
    }

    return {
      getAll, getMeta, setMeta, hasUndo, saveUndo, restoreUndo, requestPersist, isPersisted,
      putShift: (doc) => write(['shifts'], (t) => t.objectStore('shifts').put(doc)),
      deleteShift: (date) => write(['shifts'], (t) => t.objectStore('shifts').delete(date)),
      putPayslip: (doc) => write(['payslips'], (t) => t.objectStore('payslips').put(doc)),
      deletePayslip: (month) => write(['payslips'], (t) => t.objectStore('payslips').delete(month)),
      putSettings: (s) => write(['settings'], (t) => t.objectStore('settings').put(s, 'settings')),
      replaceAll: (data) => write(['shifts', 'payslips', 'settings'], (t) => fill(t, data, 'keep')),
      close: () => db.close(),
    };
  }

  return { openStore, DB_NAME, DB_VERSION, DEFAULT_META };
});
