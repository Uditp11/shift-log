/* Warehouse timesheet calc engine — pure functions, no DOM.
 * Works in Node (module.exports) and the browser (window.Calc). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN = 60000;
  const DAY = 86400000;

  const DEFAULTS = {
    ratePeriods: [{ from: '2026-09-01', rate: 15.33 }, { from: '2027-04-01', rate: 15.87 }],
    nightPct: 25, sundayPct: 50, holidayPct: 100, eveAfter14Pct: 100, overtimePct: 25,
    nightStart: '23:00', nightEnd: '06:00',
    weeklyHours: 23.07, weeksPerMonth: 4.35,
    assignmentStart: '2026-10-05', assignmentEnd: '2026-12-31',
    defaultBreakMin: 30, breakPaid: false,
    netRatio: 0.80, netRatioCalibrated: false,
    holidays: ['2026-12-25', '2026-12-26', '2027-01-01', '2027-03-26', '2027-03-29',
      '2027-05-01', '2027-05-06', '2027-05-17', '2027-05-27', '2027-10-03',
      '2027-12-25', '2027-12-26'],
    eveDates: ['2026-12-24', '2026-12-31', '2027-12-24', '2027-12-31'],
    monthTargetOverride: {},
  };

  function defaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  // ---------- time helpers ----------
  function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return h * 60 + mi;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function fmtHM(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function dayNum(dateStr) { // days since 1970-01-01 for a YYYY-MM-DD string
    const [y, m, d] = dateStr.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY);
  }
  function dateOfDayNum(n) {
    const t = new Date(n * DAY);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  function addDays(dateStr, k) { return dateOfDayNum(dayNum(dateStr) + k); }
  function dowOf(dateStr) { return (dayNum(dateStr) + 4) % 7; } // 0 = Sunday

  // Europe/Berlin: CEST (+2h) from last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC.
  function lastSunday(y, month) { // month 1–12
    const d = new Date(Date.UTC(y, month, 0));
    return d.getUTCDate() - d.getUTCDay();
  }
  const dstCache = {};
  function offsetMinAt(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    let r = dstCache[y];
    if (!r) r = dstCache[y] = [Date.UTC(y, 2, lastSunday(y, 3), 1), Date.UTC(y, 9, lastSunday(y, 10), 1)];
    return utcMs >= r[0] && utcMs < r[1] ? 120 : 60;
  }
  // Local wall time → UTC ms. Ambiguous times take the first occurrence; times in the spring gap move forward.
  function localToUtc(dateStr, minOfDay) {
    const naive = dayNum(dateStr) * DAY + minOfDay * MIN;
    const a = naive - 120 * MIN;
    if (offsetMinAt(a) === 120) return a;
    return naive - 60 * MIN;
  }
  function utcToLocal(ms) {
    const local = ms + offsetMinAt(ms) * MIN;
    const dn = Math.floor(local / DAY);
    return { dn, min: Math.round((local - dn * DAY) / MIN) };
  }

  function rateFor(dateStr, settings) {
    const periods = (settings.ratePeriods || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
    let rate = periods.length ? periods[0].rate : 0;
    for (const p of periods) if (p.from <= dateStr) rate = p.rate;
    return +rate;
  }

  function inWindow(min, start, end) {
    return start <= end ? min >= start && min < end : min >= start || min < end;
  }

  function shiftBounds(shift) {
    const f = parseHM(shift.from), t = parseHM(shift.till);
    if (f == null || t == null) return null;
    const startMs = localToUtc(shift.date, f);
    const endDate = t <= f ? addDays(shift.date, 1) : shift.date;
    const endMs = localToUtc(endDate, t);
    return { f, t, startMs, endMs };
  }

  const CATS = ['holiday', 'eve', 'sunday', 'night']; // tie-break order when two bonuses are equal

  function emptyResult(shift) {
    return {
      date: shift.date, status: shift.status || 'worked', worked: false,
      spanH: 0, paidH: 0, nightH: 0, sundayH: 0, holidayH: 0, eveH: 0, bonusH: 0,
      rate: 0, base: 0, premium: 0, gross: 0,
      premiumBreakdown: { night: 0, sunday: 0, holiday: 0, eve: 0 },
      breakFrom: null, breakTill: null, breakMin: 0, startMs: null, endMs: null,
      minuteBonus: [], runs: [], warnings: [],
    };
  }

  function calcShift(shift, settings, prevShift) {
    const s = settings || DEFAULTS;
    const res = emptyResult(shift);
    if ((shift.status || 'worked') !== 'worked') return res;
    const b = shiftBounds(shift);
    if (!b) return res;
    res.worked = true;

    const spanMin = Math.round((b.endMs - b.startMs) / MIN);
    let breakMin = shift.breakMin == null || shift.breakMin === '' ? +s.defaultBreakMin : +shift.breakMin;
    breakMin = Math.max(0, Math.min(isFinite(breakMin) ? Math.round(breakMin) : 0, spanMin));

    let bs;
    const bsMin = parseHM(shift.breakStart);
    if (bsMin != null) {
      bs = localToUtc(shift.date, bsMin);
      if (bs < b.startMs) bs = localToUtc(addDays(shift.date, 1), bsMin);
      if (bs + breakMin * MIN > b.endMs) bs = b.endMs - breakMin * MIN;
    } else {
      bs = b.startMs + Math.floor((spanMin - breakMin) / 2) * MIN;
    }
    const be = bs + breakMin * MIN;

    const rate = rateFor(shift.date, s);
    const pct = { night: +s.nightPct, sunday: +s.sundayPct, holiday: +s.holidayPct, eve: +s.eveAfter14Pct };
    const holidays = new Set(s.holidays || []);
    const eves = new Set(s.eveDates || []);
    const ns = parseHM(s.nightStart), ne = parseHM(s.nightEnd);
    const dayCache = {};

    const catMin = { night: 0, sunday: 0, holiday: 0, eve: 0 };
    const catPctMin = { night: 0, sunday: 0, holiday: 0, eve: 0 }; // integer pct·minutes
    let paidMin = 0;
    const minuteBonus = [];
    const runs = []; // display: contiguous {kind: 'b' base | 'p' bonus | 'gap' unpaid break, start, len} in minutes from start
    const pushRun = (kind, i) => {
      const last = runs[runs.length - 1];
      if (last && last.kind === kind && last.start + last.len === i) last.len++;
      else runs.push({ kind, start: i, len: 1 });
    };

    for (let i = 0; i < spanMin; i++) {
      const t = b.startMs + i * MIN;
      if (!s.breakPaid && t >= bs && t < be) { pushRun('gap', i); continue; }
      paidMin++;
      const loc = utcToLocal(t);
      let day = dayCache[loc.dn];
      if (!day) {
        const ds = dateOfDayNum(loc.dn);
        day = dayCache[loc.dn] = { sunday: (loc.dn + 4) % 7 === 0, holiday: holidays.has(ds), eve: eves.has(ds) };
      }
      const applies = {
        holiday: day.holiday,
        eve: day.eve && loc.min >= 14 * 60,
        sunday: day.sunday,
        night: ns != null && ne != null && inWindow(loc.min, ns, ne),
      };
      let win = null, best = 0;
      for (const c of CATS) if (applies[c] && pct[c] > best) { best = pct[c]; win = c; }
      minuteBonus.push(best);
      pushRun(best > 0 ? 'p' : 'b', i);
      if (win) { catMin[win]++; catPctMin[win] += best; }
    }

    res.spanH = spanMin / 60;
    res.paidH = paidMin / 60;
    res.nightH = catMin.night / 60;
    res.sundayH = catMin.sunday / 60;
    res.holidayH = catMin.holiday / 60;
    res.eveH = catMin.eve / 60;
    res.bonusH = (catMin.night + catMin.sunday + catMin.holiday + catMin.eve) / 60;
    res.rate = rate;
    res.base = (paidMin * rate) / 60;
    for (const c of CATS) res.premiumBreakdown[c] = (catPctMin[c] * rate) / 6000;
    res.premium = ((catPctMin.night + catPctMin.sunday + catPctMin.holiday + catPctMin.eve) * rate) / 6000;
    res.gross = res.base + res.premium;
    res.breakMin = breakMin;
    res.breakFrom = breakMin ? fmtHM(utcToLocal(bs).min) : null;
    res.breakTill = breakMin ? fmtHM(utcToLocal(be).min) : null;
    res.startMs = b.startMs;
    res.endMs = b.endMs;
    res.minuteBonus = minuteBonus;
    res.runs = runs;

    // ---------- warnings ----------
    const w = res.warnings;
    const workMin = spanMin - breakMin;
    if (b.f === b.t) w.push({ code: 'same-time', text: 'From = Till: counted as a 24 h shift' });
    if (workMin > 600) w.push({ code: 'over-10h', text: 'Over 10 h working time (ArbZG max 10 h)' });
    if ((workMin > 540 && breakMin < 45) || (workMin > 360 && breakMin < 30)) {
      w.push({ code: 'break-short', text: workMin > 540 ? 'Break under 45 min on a shift over 9 h' : 'Break under 30 min on a shift over 6 h' });
    }
    if (prevShift && (prevShift.status || 'worked') === 'worked') {
      const pb = shiftBounds(prevShift);
      if (pb) {
        const restH = (b.startMs - pb.endMs) / 3600000;
        if (restH < 0) w.push({ code: 'overlap', text: 'Overlaps the previous shift' });
        else if (restH < 11) w.push({ code: 'rest', text: 'Only ' + (Math.round(restH * 10) / 10) + ' h rest since the previous shift (min 11 h)' });
      }
    }
    return res;
  }

  // ---------- Step 2: aggregation ----------
  function isoWeek(dateStr) {
    const dn = dayNum(dateStr);
    const isoDow = ((dn + 3) % 7) + 1; // 1 = Monday … 7 = Sunday
    const monday = dn - (isoDow - 1);
    const thursday = monday + 3;
    const year = new Date(thursday * DAY).getUTCFullYear();
    const jan1 = Math.round(Date.UTC(year, 0, 1) / DAY);
    const week = Math.floor((thursday - jan1) / 7) + 1;
    return { year, week, key: year + '-W' + pad(week), monday: dateOfDayNum(monday), sunday: dateOfDayNum(monday + 6) };
  }

  function calcAll(shifts, settings) {
    const sorted = (shifts || []).filter((x) => x && x.date).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let prev = null;
    return sorted.map((shift) => {
      const r = calcShift(shift, settings, prev);
      if (r.worked) prev = shift;
      return { shift, r };
    });
  }

  function emptyTotals(key) {
    return {
      key, shifts: 0, paidH: 0, nightH: 0, sundayH: 0, holidayH: 0, eveH: 0, bonusH: 0,
      base: 0, premium: 0, gross: 0, avgPerH: 0,
      premiumBreakdown: { night: 0, sunday: 0, holiday: 0, eve: 0 },
      sick: 0, vacation: 0, dayoff: 0, items: [],
    };
  }

  function aggregate(all, keyFn, settings) {
    const out = {};
    for (const it of all) {
      const k = keyFn(it.shift.date);
      const t = out[k] || (out[k] = emptyTotals(k));
      t.items.push(it);
      const r = it.r;
      if (!r.worked) {
        if (t[r.status] != null) t[r.status]++;
        continue;
      }
      t.shifts++;
      for (const f of ['paidH', 'nightH', 'sundayH', 'holidayH', 'eveH', 'bonusH', 'base', 'premium', 'gross']) t[f] += r[f];
      for (const c of CATS) t.premiumBreakdown[c] += r.premiumBreakdown[c];
    }
    for (const k in out) {
      const t = out[k];
      t.avgPerH = t.paidH ? t.gross / t.paidH : 0;
      if (settings) t.net = netEstimate(t.gross, t.premium, +settings.netRatio);
    }
    return out;
  }

  const monthKey = (d) => d.slice(0, 7);
  function weekTotals(all, settings) { return aggregate(all, (d) => isoWeek(d).key, settings); }
  function monthTotals(all, settings) { return aggregate(all, monthKey, settings); }

  // ---------- Step 3: time account + expected payslip ----------
  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function nextMonth(ym) {
    let [y, m] = ym.split('-').map(Number);
    m++; if (m > 12) { m = 1; y++; }
    return y + '-' + pad(m);
  }

  function fullMonthTarget(settings) { return +settings.weeklyHours * +settings.weeksPerMonth; }

  function monthTarget(ym, settings) {
    const o = settings.monthTargetOverride || {};
    if (o[ym] != null && o[ym] !== '' && isFinite(+o[ym])) return +o[ym];
    const first = ym + '-01';
    const last = ym + '-' + pad(daysInMonth(ym));
    const from = settings.assignmentStart > first ? settings.assignmentStart : first;
    const to = settings.assignmentEnd && settings.assignmentEnd < last ? settings.assignmentEnd : last;
    const days = dayNum(to) - dayNum(from) + 1;
    if (days <= 0) return 0;
    return (fullMonthTarget(settings) * days) / daysInMonth(ym);
  }

  function absenceCreditH(settings) {
    const v = settings.absenceCreditH;
    return v != null && v !== '' && isFinite(+v) ? +v : +settings.weeklyHours / 5;
  }

  function timeAccountCap(settings) { return (200 * +settings.weeklyHours) / 35; }

  function timeAccount(all, settings, upToYm) {
    const months = monthTotals(all);
    let ym = monthKey(settings.assignmentStart);
    const lastShift = all.length ? monthKey(all[all.length - 1].shift.date) : ym;
    let end = upToYm || lastShift;
    if (lastShift > end) end = lastShift;
    const credit = absenceCreditH(settings);
    const rows = [];
    let balance = 0;
    for (let guard = 0; ym <= end && guard < 240; guard++, ym = nextMonth(ym)) {
      const t = months[ym] || emptyTotals(ym);
      const target = monthTarget(ym, settings);
      if (target === 0 && !t.items.length) continue;
      const absenceH = (t.sick + t.vacation) * credit;
      const workedH = t.paidH + absenceH;
      const delta = workedH - target;
      balance += delta;
      rows.push({ ym, target, paidH: t.paidH, absenceH, workedH, delta, balance });
    }
    return { rows, balance, cap: timeAccountCap(settings) };
  }

  function expectedPayslip(ym, all, settings) {
    const t = monthTotals(all)[ym] || emptyTotals(ym);
    const target = monthTarget(ym, settings);
    const rate = rateFor(ym + '-01', settings);
    const fixedPay = target * rate;
    const bonuses = t.premium;
    const threshold = target * 1.15;
    const overtimeH = target > 0 ? Math.max(0, Math.floor(t.paidH - threshold + 1e-9)) : 0;
    // chronologically last worked minutes of the month, topped up to overtimePct (§6.4: highest bonus only)
    let overtimeEst = 0;
    let need = overtimeH * 60;
    const ot = +settings.overtimePct;
    const worked = t.items.filter((it) => it.r.worked);
    for (let i = worked.length - 1; i >= 0 && need > 0; i--) {
      const r = worked[i].r;
      for (let j = r.minuteBonus.length - 1; j >= 0 && need > 0; j--, need--) {
        overtimeEst += (Math.max(0, ot - r.minuteBonus[j]) * r.rate) / 6000;
      }
    }
    const expectedGross = fixedPay + bonuses + overtimeEst;
    const earnedValue = t.base + t.premium;
    const taxFree = bonuses; // night/Sunday/holiday/eve bonuses: §3b EStG (overtime bonus is taxable)
    const expectedNet = netEstimate(expectedGross, taxFree, +settings.netRatio);
    return {
      ym, target, rate, fixedPay, bonuses, premiumBreakdown: t.premiumBreakdown, threshold,
      overtimeH, overtimeEst, expectedGross, paidH: t.paidH, earnedValue, taxFree, expectedNet, totals: t,
    };
  }

  function assignmentDaysIn(ym, settings) {
    const first = ym + '-01', last = ym + '-' + pad(daysInMonth(ym));
    const from = settings.assignmentStart > first ? settings.assignmentStart : first;
    const to = settings.assignmentEnd && settings.assignmentEnd < last ? settings.assignmentEnd : last;
    return Math.max(0, dayNum(to) - dayNum(from) + 1);
  }

  // Running balance per calendar day: each assignment day accrues monthTarget / assignment days in that month.
  function dailyBalance(all, settings, uptoDate) {
    const credit = absenceCreditH(settings);
    const byDate = {};
    for (const it of all) {
      const h = it.r.worked ? it.r.paidH : (it.r.status === 'sick' || it.r.status === 'vacation') ? credit : 0;
      byDate[it.shift.date] = (byDate[it.shift.date] || 0) + h;
    }
    const out = [];
    let bal = 0;
    const start = dayNum(settings.assignmentStart), end = dayNum(uptoDate);
    const perDay = {};
    for (let d = start; d <= end && d - start < 3700; d++) {
      const ds = dateOfDayNum(d), ym = ds.slice(0, 7);
      if (perDay[ym] == null) {
        const n = assignmentDaysIn(ym, settings);
        perDay[ym] = n ? monthTarget(ym, settings) / n : 0;
      }
      const inAssign = ds >= settings.assignmentStart && (!settings.assignmentEnd || ds <= settings.assignmentEnd);
      const target = inAssign ? perDay[ym] : 0;
      const worked = byDate[ds] || 0;
      bal += worked - target;
      out.push({ date: ds, worked, target, balance: bal });
    }
    return out;
  }

  // ---------- Step 4: net estimate + calibration ----------
  function netEstimate(gross, taxFree, ratio) {
    return (gross - taxFree) * ratio + taxFree;
  }

  // Returns a new settings object with netRatio derived from an entered payslip.
  function calibrate(settings, payslip, taxFree) {
    const out = JSON.parse(JSON.stringify(settings));
    const g = +payslip.grossTotal, n = +payslip.netTotal, tf = +taxFree || 0;
    if (!(g > 0) || !(n > 0) || !(g - tf > 0) || n > g) return out;
    out.netRatio = (n - tf) / (g - tf);
    out.netRatioCalibrated = true;
    return out;
  }

  return {
    defaultSettings, parseHM, fmtHM, dayNum, dateOfDayNum, addDays, dowOf,
    localToUtc, utcToLocal, rateFor, calcShift, shiftBounds,
    isoWeek, calcAll, aggregate, weekTotals, monthTotals, monthKey,
    daysInMonth, nextMonth, monthTarget, fullMonthTarget, absenceCreditH, timeAccountCap, timeAccount, expectedPayslip,
    netEstimate, calibrate, dailyBalance, assignmentDaysIn,
  };
});
