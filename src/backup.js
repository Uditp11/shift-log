/* Backup files and settings normalisation. Pure functions, no browser APIs.
 * Works in Node (module.exports) and the browser (window.Backup). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Backup = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FORMAT = 'shift-log-backup';
  const VERSION = 1;
  const STATUSES = ['worked', 'dayoff', 'sick', 'vacation'];
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH = /^\d{4}-\d{2}$/;
  const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
  const PAYSLIP_NUMS = ['grossTotal', 'netTotal', 'hoursPaid', 'premiumsPaid', 'timeAccountBalance'];
  const pad = (n) => String(n).padStart(2, '0');
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function sortedValues(map, key) {
    return Object.values(map || {}).slice().sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
  }

  function buildBackup(data, now, appVersion) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: now.toISOString(),
      appVersion: appVersion || '',
      settings: data.settings ? clone(data.settings) : null,
      shifts: clone(sortedValues(data.shifts, 'date')),
      payslips: clone(sortedValues(data.payslips, 'month')),
    };
  }

  function backupFileName(now) {
    return 'shift-log-backup-' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.json';
  }

  // Accepts an array of records, an array of {id, data} rows, or an object keyed by id.
  function normalizeList(list, key) {
    if (list == null) return [];
    const fix = (rec, id) => {
      const body = rec && typeof rec === 'object' && rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data) ? rec.data : rec;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      const out = clone(body);
      if (out[key] == null) out[key] = (rec && rec.id) || id;
      return out;
    };
    if (Array.isArray(list)) return list.map((r) => fix(r, undefined));
    if (typeof list === 'object') return Object.keys(list).map((k) => fix(list[k], k));
    return [null];
  }

  function shiftProblem(s) {
    if (!s) return 'shift: not an object';
    if (!DATE.test(String(s.date))) return 'shift date ' + JSON.stringify(s.date);
    const status = s.status == null ? 'worked' : s.status;
    if (!STATUSES.includes(status)) return 'shift ' + s.date + ': status ' + JSON.stringify(s.status);
    if (status === 'worked') {
      if (!TIME.test(String(s.from))) return 'shift ' + s.date + ': from ' + JSON.stringify(s.from);
      if (!TIME.test(String(s.till))) return 'shift ' + s.date + ': till ' + JSON.stringify(s.till);
      if (s.breakStart != null && s.breakStart !== '' && !TIME.test(String(s.breakStart))) return 'shift ' + s.date + ': breakStart ' + JSON.stringify(s.breakStart);
    }
    if (s.breakMin != null && s.breakMin !== '' && !(Number(s.breakMin) >= 0)) return 'shift ' + s.date + ': breakMin ' + JSON.stringify(s.breakMin);
    return null;
  }

  function payslipProblem(p) {
    if (!p) return 'payslip: not an object';
    if (!MONTH.test(String(p.month))) return 'payslip month ' + JSON.stringify(p.month);
    for (const k of PAYSLIP_NUMS) if (p[k] != null && typeof p[k] !== 'number') return 'payslip ' + p.month + ': ' + k + ' ' + JSON.stringify(p[k]);
    return null;
  }

  function parseBackup(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, code: 'bad-json', detail: '' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== FORMAT) return { ok: false, code: 'wrong-format', detail: '' };
    if (typeof obj.version !== 'number' || obj.version < 1) return { ok: false, code: 'wrong-format', detail: '' };
    if (obj.version > VERSION) return { ok: false, code: 'newer-version', detail: String(obj.version) };
    if (obj.settings != null && (typeof obj.settings !== 'object' || Array.isArray(obj.settings))) return { ok: false, code: 'bad-record', detail: 'settings' };
    const shifts = {}, payslips = {};
    for (const s of normalizeList(obj.shifts, 'date')) {
      const p = shiftProblem(s);
      if (p) return { ok: false, code: 'bad-record', detail: p };
      if (s.status == null) s.status = 'worked';
      shifts[s.date] = s;
    }
    for (const ps of normalizeList(obj.payslips, 'month')) {
      const p = payslipProblem(ps);
      if (p) return { ok: false, code: 'bad-record', detail: p };
      payslips[ps.month] = ps;
    }
    const dates = Object.keys(shifts).sort();
    return {
      ok: true,
      data: { shifts, payslips, settings: obj.settings ? clone(obj.settings) : null },
      summary: {
        shifts: dates.length, payslips: Object.keys(payslips).length,
        first: dates[0] || null, last: dates[dates.length - 1] || null, exportedAt: obj.exportedAt || null,
      },
    };
  }

  function mergeMissing(current, incoming) {
    return {
      shifts: { ...clone(incoming.shifts || {}), ...clone(current.shifts || {}) },
      payslips: { ...clone(incoming.payslips || {}), ...clone(current.payslips || {}) },
      settings: current.settings ? clone(current.settings) : null,
    };
  }

  // App-level defaults = the calc engine's contract defaults + the app's own keys.
  function appDefaults(calcDefaults, lang) {
    return {
      ...clone(calcDefaults),
      lang: lang === 'de' ? 'de' : 'en',
      jobLabel: 'Lagerhelfer · Deutsche Post Obertshausen · via Adecco',
      backupReminderDays: 7,
    };
  }

  // Saved settings over defaults: unknown keys dropped, new keys filled, broken shapes repaired.
  function mergeSettings(doc, defaults) {
    const s = clone(defaults);
    if (doc && typeof doc === 'object') {
      const d = clone(doc);
      for (const k of Object.keys(d)) if (k in s || k === 'absenceCreditH') s[k] = d[k];
    }
    if (!s.monthTargetOverride || typeof s.monthTargetOverride !== 'object' || Array.isArray(s.monthTargetOverride)) s.monthTargetOverride = {};
    if (!Array.isArray(s.ratePeriods) || !s.ratePeriods.length) s.ratePeriods = clone(defaults.ratePeriods);
    return s;
  }

  // Reminder rule: never backed up and at least 3 shifts, or changes since the last backup and it is older than backupReminderDays.
  function backupDue(meta, settings, shiftCount, now) {
    if (!shiftCount) return false;
    if (!meta.lastBackupAt) return shiftCount >= 3 ? { never: true } : false;
    const days = Number(settings.backupReminderDays) > 0 ? Number(settings.backupReminderDays) : 7;
    const changedSince = meta.lastChangeAt && meta.lastChangeAt > meta.lastBackupAt;
    const age = now.getTime() - new Date(meta.lastBackupAt).getTime();
    return changedSince && age > days * 86400000 ? { never: false } : false;
  }

  return { backupDue, FORMAT, VERSION, buildBackup, backupFileName, parseBackup, mergeMissing, appDefaults, mergeSettings };
});
