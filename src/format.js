/* Display formatting: German numbers and money in both languages, 24-hour times.
 * Pure functions. Works in Node (module.exports) and the browser (window.Fmt). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fmt = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const clean = (v) => (Object.is(v, -0) || v === 0 ? 0 : v);
  const sign = (v, zero) => (v > 0 ? '+' : v < 0 ? '−' : zero);

  function n2(x) { const v = clean(r2(x)); return (v < 0 ? '−' : '') + nf2.format(Math.abs(v)); }
  function eur(x) { const v = clean(r2(x)); return (v < 0 ? '−' : '') + '€ ' + nf2.format(Math.abs(v)); }
  function sEur(x) { const v = clean(r2(x)); return sign(v, '±') + '€ ' + nf2.format(Math.abs(v)); }
  function hrs(x) { return n2(x) + ' h'; }
  function sHrs(x) { const v = clean(r2(x)); return sign(v, '±') + nf2.format(Math.abs(v)) + ' h'; }

  const WD = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  };
  const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  };
  const L = (lang) => (lang === 'de' ? 'de' : 'en');
  function dow(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function dm(ds) { return ds.slice(8, 10) + '.' + ds.slice(5, 7) + '.'; }
  function dmy(ds) { return dm(ds) + ds.slice(0, 4); }
  function wd(ds, lang) { return WD[L(lang)][dow(ds)]; }
  function monthName(ym, lang) { return MONTHS[L(lang)][+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
  function monthShort(ym, lang) { return MONTHS[L(lang)][+ym.slice(5, 7) - 1].slice(0, 3); }
  function todayStr(now) { const d = now || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Whole local calendar days between an ISO timestamp and now (0 = today, 1 = yesterday).
  function daysAgo(iso, now) {
    const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
    return Math.round(day(now || new Date()) - day(new Date(iso)));
  }

  function normTime(s) {
    const t = String(s || '').trim().replace(/[.,h ]/g, ':').replace(/:+/g, ':').replace(/:$/, '');
    if (!t) return null;
    let m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
    let h, mi;
    if (m) { h = +m[1]; mi = +m[2]; }
    else if ((m = /^(\d{1,4})$/.exec(t))) {
      const d = m[1];
      if (d.length <= 2) { h = +d; mi = 0; } else { h = +d.slice(0, d.length - 2); mi = +d.slice(-2); }
    } else return null;
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return pad(h) + ':' + pad(mi);
  }
  function parseNum(s) {
    if (s == null) return null;
    let t = String(s).trim().replace(/\s|€/g, '');
    if (!t) return null;
    t = t.replace(/^−/, '-');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  }
  function numIn(v) { return v == null || v === '' ? '' : String(v).replace('.', ','); }

  return { r2, n2, eur, sEur, hrs, sHrs, dm, dmy, wd, monthName, monthShort, todayStr, daysAgo, normTime, parseNum, numIn, pad };
});
