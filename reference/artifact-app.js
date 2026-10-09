(function () {
  'use strict';
  const C = window.Calc;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  // ---------- formatting (de-DE numbers, 24 h times) ----------
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf4 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const clean = (v) => (Object.is(v, -0) || v === 0 ? 0 : v);
  const n2 = (x) => { const v = clean(r2(x)); return (v < 0 ? '−' : '') + nf2.format(Math.abs(v)); };
  const eur = (x) => { const v = clean(r2(x)); return (v < 0 ? '−' : '') + '€ ' + nf2.format(Math.abs(v)); };
  const sEur = (x) => { const v = clean(r2(x)); return (v > 0 ? '+' : v < 0 ? '−' : '±') + '€ ' + nf2.format(Math.abs(v)); };
  const hrs = (x) => n2(x) + ' h';
  const sHrs = (x) => { const v = clean(r2(x)); return (v > 0 ? '+' : v < 0 ? '−' : '±') + nf2.format(Math.abs(v)) + ' h'; };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dm = (ds) => ds.slice(8, 10) + '.' + ds.slice(5, 7) + '.';
  const dmy = (ds) => dm(ds) + ds.slice(0, 4);
  const wd = (ds) => WD[C.dowOf(ds)];
  const monthName = (ym) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
  const monthShort = (ym) => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3);
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  const STATUS = { worked: 'Worked', dayoff: 'Day off', sick: 'Sick', vacation: 'Vacation' };

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
  const numIn = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

  // ---------- state ----------
  const state = {
    shifts: {}, payslips: {}, settingsDoc: null, settings: C.defaultSettings(),
    loaded: false, tab: 'shifts', sumMode: 'week', sumKey: null, editing: null, psYm: null,
  };
  let rev = 0;
  let db = null;
  let readOnly = false;
  const S = () => state.settings;

  function mergeSettings(doc) {
    const s = C.defaultSettings();
    if (doc) {
      const d = JSON.parse(JSON.stringify(doc));
      for (const k in d) if (k in s || k === 'absenceCreditH') s[k] = d[k];
    }
    if (!s.monthTargetOverride || typeof s.monthTargetOverride !== 'object') s.monthTargetOverride = {};
    if (!Array.isArray(s.ratePeriods) || !s.ratePeriods.length) s.ratePeriods = C.defaultSettings().ratePeriods;
    return s;
  }

  let cache = null, cacheRev = -1;
  function calc() {
    if (cacheRev === rev) return cache;
    const all = C.calcAll(Object.values(state.shifts), S());
    const byDate = {};
    for (const it of all) byDate[it.shift.date] = it;
    cache = { all, byDate, weeks: C.weekTotals(all, S()), months: C.monthTotals(all, S()) };
    cacheRev = rev;
    return cache;
  }

  // ---------- sync indicator ----------
  let pending = 0;
  function setSync(kind, text) { const el = $('sync'); el.dataset.s = kind; el.lastElementChild.textContent = text; }
  function syncIdle() { if (db) setSync(readOnly ? 'local' : 'ok', readOnly ? 'View only' : 'Synced'); }

  // ---------- store: db capability, falling back to this browser ----------
  const LKEY = 'shiftlog-local-v1';
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LKEY);
      if (raw) { const d = JSON.parse(raw); state.shifts = d.shifts || {}; state.payslips = d.payslips || {}; state.settingsDoc = d.settings || null; }
    } catch (e) { /* storage unavailable: keep in memory */ }
    state.settings = mergeSettings(state.settingsDoc);
  }
  function saveLocal() {
    try { localStorage.setItem(LKEY, JSON.stringify({ shifts: state.shifts, payslips: state.payslips, settings: state.settingsDoc })); } catch (e) { /* ignore */ }
  }
  const chains = {};
  function queued(path, fn) {
    const p = (chains[path] || Promise.resolve()).catch(() => {}).then(fn);
    chains[path] = p;
    return p;
  }
  async function write(path, body) {
    if (!db) {
      const [col, id] = path.split('/');
      if (col === 'shifts') { if (body) state.shifts[id] = body; else delete state.shifts[id]; }
      if (col === 'payslips') { if (body) state.payslips[id] = body; else delete state.payslips[id]; }
      if (col === 'settings') { state.settingsDoc = body; state.settings = mergeSettings(body); }
      saveLocal(); bump();
      return;
    }
    pending++; setSync('busy', 'Saving…');
    try {
      await queued(path, () => (body ? db.doc(path).set(body) : db.doc(path).delete()));
    } catch (e) {
      if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) readOnly = true;
      throw e;
    } finally {
      pending--; if (!pending) syncIdle();
    }
  }
  function writeError(e) {
    if (readOnly) return 'You can view this log but not change it.';
    if (e && e.code === 'quota_exceeded') return 'Storage is full. Delete old entries, then try again.';
    return 'Could not save (' + ((e && e.code) || 'error') + '). Check your connection and try again.';
  }

  function subscribe() {
    let got = { shifts: false, payslips: false, settings: false };
    const ready = () => { if (got.shifts && got.payslips && got.settings && !state.loaded) { state.loaded = true; syncIdle(); } };
    const onErr = (e) => { setSync('local', e && e.code === 'revoked' ? 'Access changed' : 'Sync stopped – reload'); };
    db.collection('shifts').limit(1000).onSnapshot((snap) => {
      const m = {};
      for (const d of snap.docs) if (d.exists) m[d.id] = d.data();
      state.shifts = m; got.shifts = true; ready(); bump();
    }, onErr);
    db.collection('payslips').limit(1000).onSnapshot((snap) => {
      const m = {};
      for (const d of snap.docs) if (d.exists) m[d.id] = d.data();
      state.payslips = m; got.payslips = true; ready(); bump();
    }, onErr);
    db.doc('settings/settings').onSnapshot((snap) => {
      state.settingsDoc = snap.exists ? snap.data() : null;
      state.settings = mergeSettings(state.settingsDoc);
      got.settings = true; ready(); bump();
    }, onErr);
  }

  let raf = 0;
  function bump() {
    rev++;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderTab(); renderPreview(); });
  }

  // ---------- shared bits ----------
  const warnIcon = '<svg aria-hidden="true"><use href="#i-warn"/></svg>';
  function stripHtml(shift, r) {
    const f = C.parseHM(shift.from);
    if (f == null || !r.runs) return '';
    const W = 36 * 60;
    const s = S();
    const ns = C.parseHM(s.nightStart), ne = C.parseHM(s.nightEnd);
    let bands = [];
    if (ns != null && ne != null) {
      if (ns > ne) bands = [[0, ne], [ns, 1440 + ne], [1440 + ns, W]];
      else bands = [[ns, ne], [1440 + ns, 1440 + ne]];
    }
    const pct = (x) => (Math.max(0, Math.min(W, x)) / W) * 100;
    let html = '<div class="strip" aria-hidden="true">';
    for (const [a, b] of bands) html += '<i class="nb" style="left:' + pct(a) + '%;width:' + (pct(b) - pct(a)) + '%"></i>';
    for (const run of r.runs) {
      if (run.kind === 'gap') continue;
      const a = f + run.start, b = a + run.len;
      if (a >= W) continue;
      html += '<i class="seg ' + run.kind + '" style="left:' + pct(a) + '%;width:' + (pct(b) - pct(a)) + '%"></i>';
    }
    return html + '</div>';
  }
  const stripAxis = '<div class="strip-axis" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>00</span><span>06</span><span>12</span></div>';
  const stripLegend = '<div class="legend"><span><i style="background:var(--base)"></i>Base</span><span><i style="background:var(--bonus)"></i>With bonus</span><span><i style="background:var(--nightband)"></i>Night window</span></div>';

  function warnList(ws) {
    if (!ws.length) return '';
    return '<ul class="warns">' + ws.map((w) => '<li>' + warnIcon + '<span>' + esc(w.text) + '</span></li>').join('') + '</ul>';
  }

  // ---------- Shifts tab ----------
  const F = {
    date: $('f-date'), status: $('f-status'), from: $('f-from'), till: $('f-till'),
    brk: $('f-break'), bs: $('f-breakstart'), note: $('f-note'),
  };
  function formShift() {
    const status = F.status.value;
    const b = parseNum(F.brk.value);
    return {
      date: F.date.value,
      from: status === 'worked' ? normTime(F.from.value) || '' : '',
      till: status === 'worked' ? normTime(F.till.value) || '' : '',
      breakMin: b == null || isNaN(b) ? +S().defaultBreakMin : Math.max(0, Math.round(b)),
      breakStart: status === 'worked' ? normTime(F.bs.value) : null,
      status,
      note: F.note.value.trim(),
    };
  }
  function prevWorkedBefore(date) {
    let best = null;
    for (const d in state.shifts) {
      const sh = state.shifts[d];
      if (d < date && (sh.status || 'worked') === 'worked' && (!best || d > best.date)) best = sh;
    }
    return best;
  }
  function renderPreview() {
    const el = $('preview');
    const sh = formShift();
    const worked = sh.status === 'worked';
    for (const k of ['from', 'till', 'bs', 'brk']) F[k].disabled = !worked;
    if (!sh.date) { el.innerHTML = '<p class="muted small">Pick the date the shift starts on.</p>'; return; }
    let clash = '';
    if (state.shifts[sh.date] && state.editing !== sh.date) {
      clash = '<ul class="warns"><li>' + warnIcon + '<span>' + wd(sh.date) + ' ' + dm(sh.date) + ' already has an entry. Saving replaces it.</span></li></ul>';
    }
    if (!worked) {
      const credit = sh.status === 'sick' || sh.status === 'vacation'
        ? 'Credits ' + hrs(C.absenceCreditH(S())) + ' to the time account. No shift pay is calculated.'
        : 'No hours, no pay. Saved so the week shows a complete record.';
      el.innerHTML = '<p class="small muted">' + credit + '</p>' + clash;
      return;
    }
    if (!sh.from || !sh.till) {
      el.innerHTML = '<p class="small muted">Enter From and Till as 24-hour times, e.g. 2200 or 22:00. Pay for the shift appears here.</p>' + clash;
      return;
    }
    const r = C.calcShift(sh, S(), prevWorkedBefore(sh.date));
    const nextDay = C.parseHM(sh.till) <= C.parseHM(sh.from);
    const cell = (label, v) => '<div><span class="label">' + label + '</span><b>' + v + '</b></div>';
    let grid = cell('Paid', hrs(r.paidH)) + cell('Night', hrs(r.nightH));
    if (r.sundayH) grid += cell('Sunday', hrs(r.sundayH));
    if (r.holidayH) grid += cell('Holiday', hrs(r.holidayH));
    if (r.eveH) grid += cell('24./31.12', hrs(r.eveH));
    grid += cell('Base', eur(r.base)) + cell('Bonuses', eur(r.premium)) + cell('Rate', eur(r.rate) + '/h');
    el.innerHTML =
      '<div class="pv-head"><div><div class="label">Pay for this shift</div><div class="pv-gross">' + eur(r.gross) + '</div></div>' +
      '<div class="small muted mono">' + esc(sh.from) + ' → ' + esc(sh.till) + (nextDay ? ' (+1 day)' : '') +
      (r.breakMin ? '<br>break ' + r.breakFrom + '–' + r.breakTill + (S().breakPaid ? ' paid' : ' unpaid') : '<br>no break') + '</div></div>' +
      '<div>' + stripHtml(sh, r) + stripAxis + '</div>' + stripLegend +
      '<div class="pv-grid">' + grid + '</div>' + warnList(r.warnings) + clash;
  }

  function topTimes(field, fallback) {
    const count = {};
    for (const d in state.shifts) {
      const v = state.shifts[d][field];
      if (v && (state.shifts[d].status || 'worked') === 'worked') count[v] = (count[v] || 0) + 1;
    }
    const list = Object.keys(count).sort((a, b) => count[b] - count[a] || (a < b ? -1 : 1)).slice(0, 4);
    return list.length ? list : fallback;
  }
  function renderChips() {
    const mk = (id, vals, input) => {
      $(id).innerHTML = vals.map((v) => '<button type="button" class="chip" data-v="' + esc(v) + '">' + esc(v) + '</button>').join('');
      $(id).onclick = (e) => {
        const b = e.target.closest('.chip'); if (!b || input.disabled) return;
        input.value = b.dataset.v; renderPreview();
      };
    };
    mk('chips-from', topTimes('from', ['22:00', '23:00']), F.from);
    mk('chips-till', topTimes('till', ['06:30']), F.till);
  }

  function resetForm(date, keepTimes) {
    state.editing = null;
    F.date.value = date || todayStr();
    F.status.value = 'worked';
    if (!keepTimes) { F.from.value = ''; F.till.value = ''; F.brk.value = S().defaultBreakMin; }
    F.bs.value = ''; F.note.value = '';
    $('form-title').textContent = 'Add shift';
    $('f-save').textContent = 'Save shift';
    $('f-delete').hidden = true; disarm($('f-delete'));
    $('f-cancel').hidden = true;
    renderPreview(); renderShiftList();
  }
  function loadIntoForm(date) {
    const sh = state.shifts[date]; if (!sh) return;
    state.editing = date;
    F.date.value = sh.date; F.status.value = sh.status || 'worked';
    F.from.value = sh.from || ''; F.till.value = sh.till || '';
    F.brk.value = sh.breakMin == null ? S().defaultBreakMin : sh.breakMin;
    F.bs.value = sh.breakStart || ''; F.note.value = sh.note || '';
    $('form-title').textContent = 'Edit ' + wd(date) + ' ' + dm(date);
    $('f-save').textContent = 'Save changes';
    $('f-delete').hidden = false; disarm($('f-delete'));
    $('f-cancel').hidden = false;
    $('f-msg').textContent = ''; $('f-msg').className = 'msg';
    renderPreview(); renderShiftList();
    $('shift-form').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function arm(btn, label, ms) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1'; btn.dataset.label = btn.textContent; btn.textContent = label; btn.classList.add('armed');
    clearTimeout(btn._t); btn._t = setTimeout(() => disarm(btn), ms || 4000);
    return false;
  }
  function disarm(btn) {
    if (!btn.dataset.armed) return;
    delete btn.dataset.armed; btn.textContent = btn.dataset.label; btn.classList.remove('armed'); clearTimeout(btn._t);
  }

  function msg(id, text, err) { const el = $(id); el.textContent = text; el.className = 'msg' + (err ? ' err' : ''); }

  $('shift-form').addEventListener('input', (e) => { if (e.target !== F.note) renderPreview(); });
  for (const k of ['from', 'till', 'bs']) F[k].addEventListener('blur', () => { const n = normTime(F[k].value); if (n) F[k].value = n; renderPreview(); });
  $('shift-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sh = formShift();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sh.date)) return msg('f-msg', 'Pick a date.', true);
    if (sh.status === 'worked') {
      if (!sh.from || !sh.till) return msg('f-msg', 'Enter From and Till as 24-hour times (HH:MM).', true);
      if (F.bs.value.trim() && !sh.breakStart) return msg('f-msg', 'Break start must be a time like 02:00, or blank.', true);
      F.from.value = sh.from; F.till.value = sh.till;
    }
    const old = state.editing;
    try {
      await write('shifts/' + sh.date, sh);
      if (old && old !== sh.date) await write('shifts/' + old, null);
      msg('f-msg', 'Saved ' + wd(sh.date) + ' ' + dmy(sh.date) + '.');
      resetForm(C.addDays(sh.date, 1), true);
    } catch (err) { msg('f-msg', writeError(err), true); }
  });
  $('f-delete').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!arm(btn, 'Tap again to delete')) return;
    disarm(btn);
    const d = state.editing; if (!d) return;
    try { await write('shifts/' + d, null); msg('f-msg', 'Deleted ' + wd(d) + ' ' + dmy(d) + '.'); resetForm(d, true); }
    catch (err) { msg('f-msg', writeError(err), true); }
  });
  $('f-cancel').addEventListener('click', () => { msg('f-msg', ''); resetForm(); });

  function renderShiftList() {
    const el = $('shift-list');
    const { all, weeks } = calc();
    if (!all.length) {
      el.innerHTML = '<div class="card empty">' + (state.loaded ? 'No shifts yet. Add your first one above: date, From, Till.' : 'Loading your shifts…') + '</div>';
      return;
    }
    const keys = Object.keys(weeks).sort().reverse();
    let html = '';
    for (const k of keys) {
      const w = weeks[k];
      const wk = C.isoWeek(w.items[0].shift.date);
      html += '<section class="week"><div class="week-head"><h3>KW ' + wk.week + ' <span class="small muted" style="font-family:var(--body);font-weight:500">' + dm(wk.monday) + '–' + dm(wk.sunday) + '</span></h3>' +
        '<span class="num">' + hrs(w.paidH) + ' · ' + eur(w.gross) + '</span></div><div class="rows">';
      for (const it of w.items) {
        const sh = it.shift, r = it.r;
        const flags = r.warnings.length ? '<span class="flag" title="' + esc(r.warnings.map((x) => x.text).join('\n')) + '">' + warnIcon + r.warnings.length + '</span>' : '';
        let mid, g;
        if (r.worked) {
          const extra = [hrs(r.paidH) + ' paid', hrs(r.nightH) + ' night'];
          if (r.sundayH) extra.push(hrs(r.sundayH) + ' Sun');
          if (r.holidayH + r.eveH) extra.push(hrs(r.holidayH + r.eveH) + ' holiday');
          mid = '<div class="times">' + esc(sh.from) + '–' + esc(sh.till) + flags + '</div>' + stripHtml(sh, r) + '<div class="meta">' + extra.join(' · ') + '</div>';
          g = eur(r.gross) + '<small>+' + eur(r.premium) + '</small>';
        } else {
          mid = '<div class="times"><span class="status">' + esc(STATUS[r.status] || r.status) + '</span></div>' + (sh.note ? '<div class="meta">' + esc(sh.note) + '</div>' : '');
          g = '<span class="muted">—</span>';
        }
        html += '<button type="button" class="row' + (state.editing === sh.date ? ' editing' : '') + '" data-date="' + sh.date + '" aria-label="Edit ' + wd(sh.date) + ' ' + dm(sh.date) + '">' +
          '<div class="d">' + wd(sh.date) + '<small>' + dm(sh.date) + '</small></div><div class="mid">' + mid + '</div><div class="g">' + g + '</div></button>';
      }
      html += '</div></section>';
    }
    el.innerHTML = html;
  }
  $('shift-list').addEventListener('click', (e) => { const b = e.target.closest('.row'); if (b) loadIntoForm(b.dataset.date); });

  // ---------- charts ----------
  function niceStep(range, n) {
    const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function showTip(chart, x, y, html) {
    let t = chart.querySelector('.tip');
    if (!t) { t = document.createElement('div'); t.className = 'tip'; chart.appendChild(t); }
    t.innerHTML = html; t.hidden = false;
    const w = chart.clientWidth, tw = t.offsetWidth;
    const left = Math.max(tw / 2, Math.min(w - tw / 2, x));
    t.style.left = left + 'px'; t.style.top = y + 'px';
  }
  function hideTip(chart) { const t = chart.querySelector('.tip'); if (t) t.hidden = true; }
  function topRound(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  function barChart(el, bars, onPick) {
    const W = Math.max(280, el.clientWidth || 600), H = 210, L = 52, R = 6, T = 14, B = 26;
    const iw = W - L - R, ih = H - T - B;
    const max = Math.max(1, ...bars.map((b) => b.base + b.bonus));
    const step = niceStep(max, 4), top = Math.ceil(max / step) * step;
    const y = (v) => T + ih - (v / top) * ih;
    const slot = iw / Math.max(1, bars.length), bw = Math.min(34, slot * 0.66);
    const anyHl = bars.some((b) => b.hl);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gross pay per week, base and bonuses stacked">';
    for (let v = 0; v <= top + 1e-9; v += step) {
      s += '<line class="' + (v === 0 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + (v >= 1000 ? nf2.format(v / 1000).replace(/,00$/, '') + 'k' : Math.round(v)) + '</text>';
    }
    const every = Math.ceil(bars.length / Math.max(1, Math.floor(iw / 26)));
    bars.forEach((b, i) => {
      const cx = L + slot * i + slot / 2, x = cx - bw / 2;
      const op = anyHl && !b.hl ? ' opacity=".4"' : '';
      const hb = (b.base / top) * ih, hp = (b.bonus / top) * ih;
      if (b.base + b.bonus > 0) {
        const gap = b.bonus > 0 && b.base > 0 ? 2 : 0;
        if (b.bonus > 0) {
          s += '<path fill="var(--base)"' + op + ' d="M' + x + ',' + (T + ih) + 'V' + (T + ih - hb) + 'H' + (x + bw) + 'V' + (T + ih) + 'Z"/>';
          s += '<path fill="var(--bonus)"' + op + ' d="' + topRound(x, T + ih - hb - hp - gap, bw, Math.max(0, hp), 4) + '"/>';
        } else {
          s += '<path fill="var(--base)"' + op + ' d="' + topRound(x, T + ih - hb, bw, hb, 4) + '"/>';
        }
      }
      if (i % every === 0) s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(b.label) + '</text>';
      s += '<rect class="hit" data-i="' + i + '" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + ih + '" fill="transparent"/>';
    });
    s += '<text x="' + L + '" y="' + (H - 8) + '" text-anchor="end" dx="-6">KW</text></svg>';
    el.innerHTML = s;
    const svg = el.querySelector('svg');
    const scale = () => el.clientWidth / W;
    svg.addEventListener('pointermove', (e) => {
      const r = e.target.closest('.hit'); if (!r) return hideTip(el);
      const b = bars[+r.dataset.i], i = +r.dataset.i;
      const cx = (L + slot * i + slot / 2) * scale(), ty = y(b.base + b.bonus) * scale();
      showTip(el, cx, ty, '<div>' + esc(b.title) + '</div><b>' + eur(b.base + b.bonus) + '</b> gross<br>Base <b>' + eur(b.base) + '</b> · Bonus <b>' + eur(b.bonus) + '</b>');
    });
    svg.addEventListener('pointerleave', () => hideTip(el));
    if (onPick) svg.addEventListener('click', (e) => { const r = e.target.closest('.hit'); if (r) onPick(bars[+r.dataset.i]); });
  }

  function lineChart(el, pts) {
    const W = Math.max(280, el.clientWidth || 600), H = 200, L = 52, R = 14, T = 14, B = 26;
    const iw = W - L - R, ih = H - T - B;
    if (!pts.length) { el.innerHTML = '<p class="empty">No days in the assignment yet.</p>'; return; }
    let lo = Math.min(0, ...pts.map((p) => p.balance)), hi = Math.max(0, ...pts.map((p) => p.balance));
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => L + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Time-account balance per day">';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const vv = Math.round(v * 1000) / 1000;
      s += '<line class="' + (vv === 0 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(vv) + '" y2="' + y(vv) + '"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y(vv) + 3) + '" text-anchor="end">' + (vv > 0 ? '+' : vv < 0 ? '−' : '') + Math.abs(Math.round(vv)) + '</text>';
    }
    pts.forEach((p, i) => {
      if (p.date.slice(8) === '01' || i === 0) {
        s += '<line class="grid" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (T + ih) + '" stroke-dasharray="2 3"/>';
        s += '<text x="' + (x(i) + 3) + '" y="' + (H - 8) + '">' + monthShort(p.date.slice(0, 7)) + '</text>';
      }
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.balance).toFixed(1)).join('');
    s += '<path d="' + line + 'L' + x(pts.length - 1).toFixed(1) + ',' + y(0) + 'L' + x(0).toFixed(1) + ',' + y(0) + 'Z" fill="var(--base)" opacity=".12"/>';
    s += '<path d="' + line + '" fill="none" stroke="var(--base)" stroke-width="2" stroke-linejoin="round"/>';
    const last = pts[pts.length - 1];
    s += '<circle cx="' + x(pts.length - 1) + '" cy="' + y(last.balance) + '" r="4.5" fill="var(--base)" stroke="var(--paper)" stroke-width="2"/>';
    s += '<line class="xh" x1="0" x2="0" y1="' + T + '" y2="' + (T + ih) + '" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>';
    s += '<circle class="xd" r="4.5" fill="var(--base)" stroke="var(--paper)" stroke-width="2" visibility="hidden"/>';
    s += '<rect class="ov" x="' + L + '" y="' + T + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>';
    el.innerHTML = s;
    const svg = el.querySelector('svg'), xh = svg.querySelector('.xh'), xd = svg.querySelector('.xd');
    svg.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect(), k = W / rect.width;
      const px = (e.clientX - rect.left) * k;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / iw) * (pts.length - 1))));
      const p = pts[i];
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      xd.setAttribute('cx', x(i)); xd.setAttribute('cy', y(p.balance)); xd.setAttribute('visibility', 'visible');
      showTip(el, x(i) / k, y(p.balance) / k, '<div>' + wd(p.date) + ' ' + dmy(p.date) + '</div>Balance <b>' + sHrs(p.balance) + '</b><br>Worked <b>' + hrs(p.worked) + '</b> · Soll <b>' + hrs(p.target) + '</b>');
    });
    svg.addEventListener('pointerleave', () => { hideTip(el); xh.setAttribute('visibility', 'hidden'); xd.setAttribute('visibility', 'hidden'); });
  }

  // ---------- Summary tab ----------
  function weekLabel(key, items) {
    const wk = C.isoWeek(items && items.length ? items[0].shift.date : todayStr());
    return 'KW ' + wk.week + ' · ' + dm(wk.monday) + '–' + dmy(wk.sunday);
  }
  function renderSummary() {
    const { all, weeks, months } = calc();
    const mode = state.sumMode;
    const map = mode === 'week' ? weeks : months;
    const keys = Object.keys(map).sort().reverse();
    $('sum-week').setAttribute('aria-pressed', mode === 'week');
    $('sum-month').setAttribute('aria-pressed', mode === 'month');
    const sel = $('sum-period');
    if (!keys.length) {
      sel.innerHTML = '<option>No shifts yet</option>'; sel.disabled = true;
      $('sum-tiles').innerHTML = ''; $('sum-table').innerHTML = '<p class="empty">Totals appear here once you add shifts.</p>';
      $('chart-weeks').innerHTML = '';
      return;
    }
    sel.disabled = false;
    const todayKey = mode === 'week' ? C.isoWeek(todayStr()).key : todayStr().slice(0, 7);
    if (!state.sumKey || !map[state.sumKey]) state.sumKey = map[todayKey] ? todayKey : keys[0];
    sel.innerHTML = keys.map((k) => '<option value="' + k + '"' + (k === state.sumKey ? ' selected' : '') + '>' +
      esc(mode === 'week' ? weekLabel(k, map[k].items) : monthName(k)) + '</option>').join('');
    const t = map[state.sumKey];
    const s = S();
    const ratioNote = 'estimate · ratio ' + nf4.format(s.netRatio) + (s.netRatioCalibrated ? ' (calibrated)' : ' (default)');
    const tile = (label, v, sub) => '<div class="tile"><span class="label">' + label + '</span><b>' + v + '</b><small>' + sub + '</small></div>';
    $('sum-tiles').innerHTML =
      tile('Hours', n2(t.paidH), t.shifts + ' shift' + (t.shifts === 1 ? '' : 's') + ' worked') +
      tile('Gross', eur(t.gross), 'avg ' + eur(t.avgPerH) + '/h incl. bonuses') +
      tile('Est. net', eur(t.net), ratioNote) +
      tile('Bonuses', eur(t.premium), 'tax-free (§3b EStG)');
    const pb = t.premiumBreakdown;
    const row = (name, pct, h, v) => '<tr><td>' + name + '</td><td>' + pct + '</td><td>' + hrs(h) + '</td><td>' + eur(v) + '</td></tr>';
    const rate = C.rateFor(t.items[0].shift.date, s);
    $('sum-table').innerHTML = '<table><thead><tr><th>Type</th><th>Rate</th><th>Hours</th><th>Amount</th></tr></thead><tbody>' +
      row('Night 23–06', s.nightPct + ' %', t.nightH, pb.night) +
      row('Sunday', s.sundayPct + ' %', t.sundayH, pb.sunday) +
      row('Public holiday', s.holidayPct + ' %', t.holidayH, pb.holiday) +
      row('24.12./31.12. from 14:00', s.eveAfter14Pct + ' %', t.eveH, pb.eve) +
      '<tr class="total"><td>Bonuses</td><td></td><td>' + hrs(t.bonusH) + '</td><td>' + eur(t.premium) + '</td></tr>' +
      '<tr><td>Base pay</td><td>' + eur(rate) + '</td><td>' + hrs(t.paidH) + '</td><td>' + eur(t.base) + '</td></tr>' +
      '<tr class="total"><td>Gross</td><td></td><td></td><td>' + eur(t.gross) + '</td></tr></tbody></table>' +
      '<p class="note">Hours count under the bonus that won each minute. Only the highest bonus is paid (MTV §6.4), so Sunday night hours count as Sunday.</p>';
    $('sum-table-title').textContent = 'Bonus breakdown · ' + (mode === 'week' ? 'KW ' + C.isoWeek(t.items[0].shift.date).week : monthName(state.sumKey));

    // weekly bars: from the assignment's first week to the latest entry
    const firstWk = C.isoWeek(s.assignmentStart).monday;
    const lastDate = all[all.length - 1].shift.date;
    const lastWk = C.isoWeek(lastDate > s.assignmentStart ? lastDate : s.assignmentStart).monday;
    const hlWeeks = new Set(mode === 'week' ? [state.sumKey] : t.items.map((it) => C.isoWeek(it.shift.date).key));
    const bars = [];
    for (let d = firstWk; d <= lastWk && bars.length < 120; d = C.addDays(d, 7)) {
      const wk = C.isoWeek(d), w = weeks[wk.key];
      bars.push({ key: wk.key, label: String(wk.week), title: 'KW ' + wk.week + ' · ' + dm(wk.monday) + '–' + dm(wk.sunday), base: w ? w.base : 0, bonus: w ? w.premium : 0, hl: hlWeeks.has(wk.key) });
    }
    barChart($('chart-weeks'), bars, (b) => {
      if (!weeks[b.key]) return;
      state.sumMode = 'week'; state.sumKey = b.key; renderSummary();
    });
  }
  $('sum-week').addEventListener('click', () => { if (state.sumMode !== 'week') { state.sumMode = 'week'; state.sumKey = null; renderSummary(); } });
  $('sum-month').addEventListener('click', () => { if (state.sumMode !== 'month') { state.sumMode = 'month'; state.sumKey = null; renderSummary(); } });
  $('sum-period').addEventListener('change', (e) => { state.sumKey = e.target.value; renderSummary(); });

  // ---------- Time account tab ----------
  function balanceUpTo() {
    const s = S(), { all } = calc();
    let d = todayStr();
    if (s.assignmentEnd && d > s.assignmentEnd) d = s.assignmentEnd;
    const last = all.length ? all[all.length - 1].shift.date : null;
    if (last && last > d) d = last;
    if (d < s.assignmentStart) d = s.assignmentStart;
    return d;
  }
  function renderAccount() {
    const s = S(), { all } = calc();
    const upto = balanceUpTo();
    const ta = C.timeAccount(all, s, upto.slice(0, 7));
    const pts = C.dailyBalance(all, s, upto);
    const now = pts.length ? pts[pts.length - 1].balance : 0;
    const curYm = upto.slice(0, 7);
    const cur = ta.rows.find((r) => r.ym === curYm) || { target: 0, workedH: 0 };
    const tile = (label, v, sub, neg) => '<div class="tile' + (neg ? ' neg' : '') + '"><span class="label">' + label + '</span><b>' + v + '</b><small>' + sub + '</small></div>';
    $('acc-tiles').innerHTML =
      tile('Balance', sHrs(now), 'as of ' + dmy(upto), r2(now) < 0) +
      tile('Soll ' + monthShort(curYm), n2(cur.target), hrs(cur.workedH) + ' worked so far') +
      tile('Still to work', n2(Math.max(0, cur.target - cur.workedH)), 'to reach ' + monthName(curYm) + ' Soll') +
      tile('Plus-hour cap', '≈ ' + n2(ta.cap), 'approximate · 200 h × ' + n2(s.weeklyHours) + '/35');
    lineChart($('chart-balance'), pts);

    const ov = s.monthTargetOverride || {};
    $('acc-table').innerHTML = !ta.rows.length ? '<p class="empty">No months yet.</p>' :
      '<table><thead><tr><th>Month</th><th>Soll</th><th>Worked</th><th>Δ</th><th>Balance</th></tr></thead><tbody>' +
      ta.rows.map((r) => '<tr' + (r.ym === curYm ? ' class="cur"' : '') + '><td>' + monthName(r.ym) +
        (r.ym === curYm && upto < r.ym + '-' + pad(C.daysInMonth(r.ym)) ? ' <span class="small muted">in progress</span>' : '') +
        (ov[r.ym] != null ? ' <span class="small muted">Soll from payslip</span>' : '') + '</td>' +
        '<td>' + n2(r.target) + '</td><td>' + n2(r.workedH) + '</td><td class="' + (r2(r.delta) < 0 ? 'neg' : 'pos') + '">' + sHrs(r.delta).replace(' h', '') + '</td>' +
        '<td class="' + (r2(r.balance) < 0 ? 'neg' : 'pos') + '">' + sHrs(r.balance).replace(' h', '') + '</td></tr>').join('') +
      '</tbody></table><p class="note">Hours. Worked includes ' + n2(C.absenceCreditH(s)) + ' h credit per sick or vacation day. A partial month gets Soll × assignment days ÷ days in month (MTV §14.4).</p>';

    $('acc-compare').innerHTML = !ta.rows.length ? '' :
      '<table><thead><tr><th>Month</th><th>Earned value</th><th>Expected payslip</th><th>Difference</th><th>Δ h × rate</th></tr></thead><tbody>' +
      ta.rows.map((r) => {
        const p = C.expectedPayslip(r.ym, all, s);
        const diff = p.earnedValue - (p.fixedPay + p.bonuses);
        return '<tr><td>' + monthName(r.ym) + '</td><td>' + eur(p.earnedValue) + '</td><td>' + eur(p.expectedGross) +
          (p.overtimeEst ? '<br><span class="est">incl. ' + eur(p.overtimeEst) + ' overtime est.</span>' : '') + '</td>' +
          '<td class="' + (r2(diff) < 0 ? 'neg' : 'pos') + '">' + sEur(diff) + '</td><td>' + sHrs(p.paidH - p.target).replace(' h', '') + ' × ' + n2(p.rate) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note">Earned value = all paid hours × rate + bonuses. Expected payslip = Soll × rate + bonuses' + ' (+ overtime estimate, MTV §6.1). Difference excludes the overtime estimate.</p>';
  }

  // ---------- Payslip tab ----------
  function payslipMonths() {
    const s = S(), set = new Set();
    let ym = s.assignmentStart.slice(0, 7);
    const end = (s.assignmentEnd || s.assignmentStart).slice(0, 7);
    for (let g = 0; ym <= end && g < 60; g++, ym = C.nextMonth(ym)) set.add(ym);
    for (const k in state.payslips) set.add(k);
    return [...set].sort();
  }
  function bankDay15(ym) {
    const hol = new Set(S().holidays || []);
    let d = C.nextMonth(ym) + '-01', n = 0;
    for (let g = 0; g < 40; g++, d = C.addDays(d, 1)) {
      const w = C.dowOf(d);
      if (w !== 0 && w !== 6 && !hol.has(d)) { n++; if (n === 15) return d; }
    }
    return null;
  }
  const P = { gross: $('ps-gross'), net: $('ps-net'), hours: $('ps-hours'), prem: $('ps-prem'), bal: $('ps-bal'), note: $('ps-note') };
  let psFilled = null;
  function fillPayslipForm(ym) {
    const d = state.payslips[ym] || {};
    P.gross.value = numIn(d.grossTotal); P.net.value = numIn(d.netTotal); P.hours.value = numIn(d.hoursPaid);
    P.prem.value = numIn(d.premiumsPaid); P.bal.value = numIn(d.timeAccountBalance); P.note.value = d.note || '';
    $('ps-delete').hidden = !state.payslips[ym]; disarm($('ps-delete'));
    psFilled = ym + '|' + JSON.stringify(d);
  }
  function renderPayslip() {
    const months = payslipMonths();
    if (!state.psYm || !months.includes(state.psYm)) {
      const prev = C.addDays(todayStr().slice(0, 7) + '-01', -1).slice(0, 7);
      state.psYm = months.includes(prev) ? prev : months.includes(todayStr().slice(0, 7)) ? todayStr().slice(0, 7) : months[0];
    }
    const ym = state.psYm;
    $('ps-month').innerHTML = months.map((m) => '<option value="' + m + '"' + (m === ym ? ' selected' : '') + '>' + monthName(m) + (state.payslips[m] ? ' ✓' : '') + '</option>').join('');
    if (psFilled == null || psFilled.split('|')[0] !== ym || (psFilled !== ym + '|' + JSON.stringify(state.payslips[ym] || {}) && document.activeElement && !document.activeElement.closest('#ps-form'))) fillPayslipForm(ym);

    const s = S(), { all } = calc();
    const p = C.expectedPayslip(ym, all, s);
    const sNoOv = JSON.parse(JSON.stringify(s)); delete sNoOv.monthTargetOverride[ym];
    const formulaH = C.monthTarget(ym, sNoOv);
    const ta = C.timeAccount(all, s, ym);
    const taRow = ta.rows.find((r) => r.ym === ym);
    const a = state.payslips[ym] || {};
    const due = bankDay15(ym);
    $('ps-due').textContent = due ? 'Due by ' + dmy(due) + ' (15th bank day)' : '';
    const line = (name, exp, act, kind, sub) => {
      const fmt = kind === 'h' ? hrs : eur;
      let diff = '<span class="muted">—</span>';
      if (act != null && act !== '' && isFinite(+act)) {
        const d = +act - exp, ok = kind === 'h' ? Math.abs(d) <= 0.05 : Math.abs(d) <= 1;
        diff = '<span class="pill ' + (ok ? 'ok' : 'no') + '">' + (kind === 'h' ? sHrs(d) : sEur(d)) + '</span>';
      }
      return '<tr><td>' + name + (sub ? '<br><span class="est">' + sub + '</span>' : '') + '</td><td>' + fmt(exp) + '</td><td>' +
        (act != null && act !== '' ? fmt(+act) : '<span class="muted">—</span>') + '</td><td>' + diff + '</td></tr>';
    };
    $('ps-table').innerHTML = '<table><thead><tr><th>' + monthName(ym) + '</th><th>Expected</th><th>Payslip</th><th>Difference</th></tr></thead><tbody>' +
      line('Gross', p.expectedGross, a.grossTotal, 'eur', p.overtimeEst ? 'incl. overtime estimate ' + eur(p.overtimeEst) : '') +
      line('Net', p.expectedNet, a.netTotal, 'eur', 'estimate') +
      line('Hours paid (Soll)', formulaH, a.hoursPaid, 'h', n2(C.fullMonthTarget(s)) + ' h × ' + C.assignmentDaysIn(ym, s) + '/' + C.daysInMonth(ym) + ' days') +
      line('Bonuses', p.bonuses + p.overtimeEst, a.premiumsPaid, 'eur', '') +
      line('Time account balance', taRow ? taRow.balance : 0, a.timeAccountBalance, 'h', '') +
      '</tbody></table>' +
      '<p class="note">Expected gross = Soll ' + hrs(p.target) + ' × ' + eur(p.rate) + ' = ' + eur(p.fixedPay) + ', plus bonuses ' + eur(p.bonuses) +
      (p.overtimeH ? ', plus overtime estimate for ' + p.overtimeH + ' full h above ' + hrs(p.threshold) : '') + '. Green = within €1 (hours: 0,05 h).</p>';
    $('ps-ratio').textContent = s.netRatioCalibrated
      ? 'Net ratio ' + nf4.format(s.netRatio) + ', calibrated from your payslip: (net − tax-free bonuses) ÷ (gross − tax-free bonuses). Every net figure is still an estimate.'
      : 'Net ratio ' + nf4.format(s.netRatio) + ' is a default guess. Enter a payslip with gross and net to calibrate it.';
  }
  $('ps-month').addEventListener('change', (e) => { state.psYm = e.target.value; psFilled = null; msg('ps-msg', ''); renderPayslip(); });
  $('ps-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ym = state.psYm;
    const vals = { grossTotal: parseNum(P.gross.value), netTotal: parseNum(P.net.value), hoursPaid: parseNum(P.hours.value), premiumsPaid: parseNum(P.prem.value), timeAccountBalance: parseNum(P.bal.value) };
    for (const k in vals) if (Number.isNaN(vals[k])) return msg('ps-msg', 'Use numbers like 1.234,56 or 87,41.', true);
    const doc = { month: ym, ...vals, note: P.note.value.trim() };
    // derived settings: Soll override + net-ratio calibration
    let ns = JSON.parse(JSON.stringify(S()));
    if (vals.hoursPaid != null && vals.hoursPaid > 0) ns.monthTargetOverride[ym] = vals.hoursPaid;
    const p = C.expectedPayslip(ym, calc().all, ns);
    if (vals.grossTotal && vals.netTotal) ns = C.calibrate(ns, vals, p.taxFree);
    try {
      await write('payslips/' + ym, doc);
      if (JSON.stringify(ns) !== JSON.stringify(S())) await write('settings/settings', ns);
      psFilled = null;
      msg('ps-msg', 'Saved the ' + monthName(ym) + ' payslip.' + (ns.netRatioCalibrated && vals.grossTotal && vals.netTotal ? ' Net ratio calibrated to ' + nf4.format(ns.netRatio) + '.' : ''));
    } catch (err) { msg('ps-msg', writeError(err), true); }
  });
  $('ps-delete').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!arm(btn, 'Tap again to delete')) return;
    disarm(btn);
    const ym = state.psYm;
    const ns = JSON.parse(JSON.stringify(S()));
    delete ns.monthTargetOverride[ym];
    try {
      await write('payslips/' + ym, null);
      if (JSON.stringify(ns) !== JSON.stringify(S())) await write('settings/settings', ns);
      psFilled = null; msg('ps-msg', 'Deleted the ' + monthName(ym) + ' payslip.');
    } catch (err) { msg('ps-msg', writeError(err), true); }
  });

  // ---------- Settings ----------
  const SET_NUM = ['nightPct', 'sundayPct', 'holidayPct', 'eveAfter14Pct', 'overtimePct', 'weeklyHours', 'weeksPerMonth', 'defaultBreakMin', 'netRatio'];
  function rateRow(p) {
    return '<div class="rp"><label class="field"><span>Valid from</span><input type="date" class="rp-from" value="' + esc(p.from) + '"></label>' +
      '<label class="field"><span>€ per hour</span><input class="rp-rate" inputmode="decimal" value="' + esc(numIn(p.rate)) + '"></label>' +
      '<button class="btn rp-del" type="button" aria-label="Remove rate period">Remove</button></div>';
  }
  function fillSettings(s) {
    $('set-rates').innerHTML = s.ratePeriods.map(rateRow).join('');
    for (const k of SET_NUM) $('s-' + k).value = numIn(s[k]);
    $('s-nightStart').value = s.nightStart; $('s-nightEnd').value = s.nightEnd;
    $('s-assignmentStart').value = s.assignmentStart; $('s-assignmentEnd').value = s.assignmentEnd || '';
    $('s-absenceCreditH').value = numIn(s.absenceCreditH);
    $('s-breakPaid').checked = !!s.breakPaid; $('s-netRatioCalibrated').checked = !!s.netRatioCalibrated;
    $('s-holidays').value = (s.holidays || []).join('\n'); $('s-eveDates').value = (s.eveDates || []).join('\n');
    $('s-overrides').value = Object.keys(s.monthTargetOverride || {}).sort().map((k) => k + ' = ' + numIn(s.monthTargetOverride[k])).join('\n');
    msg('set-msg', '');
  }
  function readSettings() {
    const s = JSON.parse(JSON.stringify(S()));
    const err = (t) => { throw new Error(t); };
    s.ratePeriods = [...$('set-rates').querySelectorAll('.rp')].map((row) => {
      const from = row.querySelector('.rp-from').value, rate = parseNum(row.querySelector('.rp-rate').value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !(rate > 0)) err('Each rate period needs a start date and a rate above 0.');
      return { from, rate };
    }).sort((a, b) => (a.from < b.from ? -1 : 1));
    if (!s.ratePeriods.length) err('Keep at least one rate period.');
    for (const k of SET_NUM) { const v = parseNum($('s-' + k).value); if (v == null || isNaN(v) || v < 0) err('Check the value for ' + k + '.'); s[k] = v; }
    if (s.netRatio > 1) err('Net ratio must be between 0 and 1.');
    for (const k of ['nightStart', 'nightEnd']) { const t = normTime($('s-' + k).value); if (!t) err('Night window times must look like 23:00.'); s[k] = t; }
    s.assignmentStart = $('s-assignmentStart').value || err('Set the assignment start date.');
    s.assignmentEnd = $('s-assignmentEnd').value || '';
    const ac = parseNum($('s-absenceCreditH').value);
    if (ac == null) delete s.absenceCreditH; else if (isNaN(ac) || ac < 0) err('Sick/vacation credit must be hours, or blank.'); else s.absenceCreditH = ac;
    s.breakPaid = $('s-breakPaid').checked; s.netRatioCalibrated = $('s-netRatioCalibrated').checked;
    const dates = (id) => $(id).value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(x)) x = x.slice(6) + '-' + x.slice(3, 5) + '-' + x.slice(0, 2);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) err('Dates must be YYYY-MM-DD: ' + x);
      return x;
    }).sort();
    s.holidays = dates('s-holidays'); s.eveDates = dates('s-eveDates');
    s.monthTargetOverride = {};
    for (const ln of $('s-overrides').value.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(\d{4}-\d{2})\s*[=:]\s*([\d.,]+)$/.exec(ln);
      if (!m) err('Overrides must look like 2026-10 = 87,41');
      s.monthTargetOverride[m[1]] = parseNum(m[2]);
    }
    return s;
  }
  function openSettings() { fillSettings(S()); $('settings').hidden = false; document.body.style.overflow = 'hidden'; $('set-close').focus(); }
  function closeSettings() { $('settings').hidden = true; document.body.style.overflow = ''; $('open-settings').focus(); }
  $('open-settings').addEventListener('click', openSettings);
  $('set-close').addEventListener('click', closeSettings);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settings').hidden) closeSettings(); });
  $('set-addrate').addEventListener('click', () => {
    const last = [...$('set-rates').querySelectorAll('.rp-rate')].pop();
    $('set-rates').insertAdjacentHTML('beforeend', rateRow({ from: '', rate: last ? parseNum(last.value) : '' }));
  });
  $('set-rates').addEventListener('click', (e) => { const b = e.target.closest('.rp-del'); if (b) b.closest('.rp').remove(); });
  $('set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let s;
    try { s = readSettings(); } catch (er) { return msg('set-msg', er.message, true); }
    try { await write('settings/settings', s); msg('set-msg', 'Saved. All shifts recalculated.'); }
    catch (err) { msg('set-msg', writeError(err), true); }
  });
  $('set-reset').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!arm(btn, 'Tap again to reset everything')) return;
    disarm(btn);
    const s = C.defaultSettings();
    try { await write('settings/settings', s); fillSettings(s); msg('set-msg', 'Reset to the contract defaults.'); }
    catch (err) { msg('set-msg', writeError(err), true); }
  });

  // CSV export
  function buildCsv() {
    const num = (x, d) => (x == null || x === '' ? '' : (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','));
    const q = (v) => { const t = String(v == null ? '' : v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const head = ['Date', 'Weekday', 'Status', 'From', 'Till', 'Break min', 'Break from', 'Paid h', 'Night h', 'Sunday h', 'Holiday h', 'Eve h', 'Rate €', 'Base €', 'Bonus €', 'Gross €', 'Warnings', 'Note'];
    const lines = [head.join(';')];
    for (const { shift: sh, r } of calc().all) {
      lines.push([dmy(sh.date), wd(sh.date), STATUS[r.status] || r.status, sh.from || '', sh.till || '', r.worked ? r.breakMin : '', r.breakFrom || '',
        num(r.paidH, 2), num(r.nightH, 2), num(r.sundayH, 2), num(r.holidayH, 2), num(r.eveH, 2), r.worked ? num(r.rate, 2) : '',
        num(r.base, 2), num(r.premium, 2), num(r.gross, 2), r.warnings.map((w) => w.text).join(' | '), sh.note || ''].map(q).join(';'));
    }
    return lines.join('\r\n') + '\r\n';
  }
  $('csv-btn').addEventListener('click', async () => {
    const csv = buildCsv();
    const name = 'shift-log-' + todayStr() + '.csv';
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    const fallback = (why) => { $('csv-box').hidden = false; $('csv-text').value = csv; msg('csv-msg', why); };
    if (!dl) return fallback('Saving files is not available here. Copy the text below into a .csv file.');
    try { await dl.save({ filename: name, data: '﻿' + csv }); msg('csv-msg', 'Saved ' + name + '.'); }
    catch (e) {
      if (e && e.code === 'declined') msg('csv-msg', 'Export cancelled.');
      else if (e && e.code === 'rate_limited') msg('csv-msg', 'A save prompt is already open.');
      else fallback('The file could not be saved here. Copy the text below instead.');
    }
  });
  $('csv-copy').addEventListener('click', () => {
    const ta = $('csv-text');
    const sel = () => { ta.focus(); ta.select(); msg('csv-msg', 'Selected. Copy it with your keyboard or long-press.'); };
    try { navigator.clipboard.writeText(ta.value).then(() => msg('csv-msg', 'Copied.'), sel); } catch (e) { sel(); }
  });

  // ---------- tabs ----------
  const TABS = ['shifts', 'summary', 'account', 'payslip'];
  function renderTab() {
    if (state.tab === 'shifts') { renderChips(); renderShiftList(); }
    else if (state.tab === 'summary') renderSummary();
    else if (state.tab === 'account') renderAccount();
    else if (state.tab === 'payslip') renderPayslip();
  }
  function setTab(t, noScroll) {
    if (!TABS.includes(t)) t = 'shifts';
    state.tab = t;
    for (const x of TABS) $('tab-' + x).hidden = x !== t;
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.tab === t);
    try { localStorage.setItem('shiftlog-tab', t); } catch (e) { /* ignore */ }
    renderTab();
    if (!noScroll) window.scrollTo(0, 0);
  }
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.tab === 'summary' || state.tab === 'account') renderTab(); }, 150); });

  // ---------- boot ----------
  async function boot() {
    F.date.value = todayStr();
    F.brk.value = S().defaultBreakMin;
    let start = (location.hash || '').slice(1);
    if (!TABS.includes(start)) { try { start = localStorage.getItem('shiftlog-tab') || 'shifts'; } catch (e) { start = 'shifts'; } }
    setTab(start, true);
    renderPreview();
    let d = null;
    if (window.claude && typeof window.claude.use === 'function') {
      try { d = await window.claude.use('db'); } catch (e) { d = null; }
    }
    if (d) { db = d; setSync('busy', 'Syncing…'); subscribe(); }
    else { loadLocal(); state.loaded = true; setSync('local', 'This browser only'); F.brk.value = S().defaultBreakMin; bump(); }
  }
  boot();
})();
