/* The UI: four tabs (Shifts, Summary, Time account, Payslip) and Settings.
 * Ported from the Claude artifact; storage is IndexedDB (Store), text is I18n, formats are Fmt.
 * Browser only: this is the page's entry point, so it exports nothing (unlike the other src/ files). */
(function () {
  'use strict';
  const C = window.Calc;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- formatting (Fmt: German numbers in both languages, names follow the language) ----------
  const { pad, r2, n2, eur, sEur, hrs, sHrs, dm, dmy, normTime, parseNum, numIn } = Fmt;
  const t = I18n.t;
  const wd = (ds) => Fmt.wd(ds, I18n.getLang());
  const monthName = (ym) => Fmt.monthName(ym, I18n.getLang());
  const monthShort = (ym) => Fmt.monthShort(ym, I18n.getLang());
  const todayStr = () => Fmt.todayStr();
  const nf4 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const STATUS = { get worked() { return t('status.worked'); }, get dayoff() { return t('status.dayoff'); }, get sick() { return t('status.sick'); }, get vacation() { return t('status.vacation'); } };
  const kw = (n) => t('common.kw', { n });

  // ---------- state ----------
  const state = {
    shifts: {}, payslips: {}, settingsDoc: null, settings: Backup.mergeSettings(null, Backup.appDefaults(Calc.defaultSettings(), 'en')),
    meta: Store.DEFAULT_META,
    loaded: false, tab: 'shifts', sumMode: 'week', sumKey: null, editing: null, psYm: null,
  };
  let rev = 0;
  const S = () => state.settings;

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

  // ---------- storage (IndexedDB via Store) ----------
  let store = null;
  const defaults = () => Backup.appDefaults(Calc.defaultSettings(), I18n.detectLang(navigator.language));

  async function reload() {
    const all = await store.getAll();
    state.shifts = all.shifts;
    state.payslips = all.payslips;
    state.meta = all.meta;
    state.settingsDoc = all.settings;
    state.settings = Backup.mergeSettings(all.settings, defaults());
    I18n.setLang(state.settings.lang);
    state.loaded = true;
    applyStaticText();
    renderStatus();
    bump();
  }

  // Same call shape the artifact used: write('shifts/2026-10-05', doc) or write('shifts/2026-10-05', null) to delete.
  async function write(path, body) {
    if (!store) throw Object.assign(new Error('Storage unavailable'), { code: 'no-idb' });
    const [col, id] = path.split('/');
    if (col === 'shifts') await (body ? store.putShift(body) : store.deleteShift(id));
    else if (col === 'payslips') await (body ? store.putPayslip(body) : store.deletePayslip(id));
    else if (col === 'settings') await store.putSettings(body);
    else throw new Error('Unknown collection ' + col);
    await reload();
  }

  function writeError(e) {
    return t(e && e.code === 'quota' ? 'err.saveFull' : 'err.save');
  }

  function renderStatus() {
    const el = $('status');
    if (!el) return;
    const last = state.meta.lastBackupAt;
    el.className = 'status-line' + (last ? '' : ' warn');
    el.textContent = t('status.saved') + ' · ' + (last ? t('status.lastBackup', { when: whenText(last) }) : t('status.noBackup'));
  }

  function whenText(iso) {
    const n = Fmt.daysAgo(iso);
    return n <= 0 ? t('when.today') : n === 1 ? t('when.yesterday') : t('when.daysAgo', { n });
  }

  let raf = 0;
  function bump() {
    rev++;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderTab(); renderPreview(); });
  }

  // ---------- text ----------
  function applyStaticText() {
    document.documentElement.lang = I18n.getLang();
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    renderFormHead();
  }

  // calc.js (frozen) gives warnings as a code plus English text; the numbers in the text are the only variable part.
  function warnText(w) {
    if (!('warn.' + w.code in I18n.STRINGS.en)) return w.text;
    const nums = (String(w.text).match(/\d+(?:\.\d+)?/g) || []).map((x) => x.replace('.', ','));
    const vars = w.code === 'rest' ? { h: nums[0] } : w.code === 'break-short' ? { min: nums[0], h: nums[1] } : null;
    return t('warn.' + w.code, vars);
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
  const stripLegend = () => '<div class="legend"><span><i style="background:var(--base)"></i>' + esc(t('shifts.legendBase')) + '</span><span><i style="background:var(--bonus)"></i>' +
    esc(t('shifts.legendBonus')) + '</span><span><i style="background:var(--nightband)"></i>' + esc(t('shifts.legendNight')) + '</span></div>';

  function warnList(ws) {
    if (!ws.length) return '';
    return '<ul class="warns">' + ws.map((w) => '<li>' + warnIcon + '<span>' + esc(warnText(w)) + '</span></li>').join('') + '</ul>';
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
    if (!sh.date) { el.innerHTML = '<p class="muted small">' + esc(t('shifts.pickDate')) + '</p>'; return; }
    let clash = '';
    if (state.shifts[sh.date] && state.editing !== sh.date) {
      clash = '<ul class="warns"><li>' + warnIcon + '<span>' + esc(t('shifts.clash', { day: wd(sh.date) + ' ' + dm(sh.date) })) + '</span></li></ul>';
    }
    if (!worked) {
      const credit = sh.status === 'sick' || sh.status === 'vacation'
        ? t('shifts.absenceCredit', { h: hrs(C.absenceCreditH(S())) })
        : t('shifts.dayoffNote');
      el.innerHTML = '<p class="small muted">' + esc(credit) + '</p>' + clash;
      return;
    }
    if (!sh.from || !sh.till) {
      el.innerHTML = '<p class="small muted">' + esc(t('shifts.enterTimes')) + '</p>' + clash;
      return;
    }
    const r = C.calcShift(sh, S(), prevWorkedBefore(sh.date));
    const nextDay = C.parseHM(sh.till) <= C.parseHM(sh.from);
    const cell = (label, v) => '<div><span class="label">' + esc(label) + '</span><b>' + v + '</b></div>';
    let grid = cell(t('shifts.pv.paid'), hrs(r.paidH)) + cell(t('shifts.pv.night'), hrs(r.nightH));
    if (r.sundayH) grid += cell(t('shifts.pv.sunday'), hrs(r.sundayH));
    if (r.holidayH) grid += cell(t('shifts.pv.holiday'), hrs(r.holidayH));
    if (r.eveH) grid += cell(t('shifts.pv.eve'), hrs(r.eveH));
    grid += cell(t('shifts.pv.base'), eur(r.base)) + cell(t('shifts.pv.bonuses'), eur(r.premium)) + cell(t('shifts.pv.rate'), eur(r.rate) + '/h');
    const brk = r.breakMin ? t(S().breakPaid ? 'shifts.breakPaid' : 'shifts.breakUnpaid', { from: r.breakFrom, till: r.breakTill }) : t('shifts.noBreak');
    el.innerHTML =
      '<div class="pv-head"><div><div class="label">' + esc(t('shifts.pvTitle')) + '</div><div class="pv-gross">' + eur(r.gross) + '</div></div>' +
      '<div class="small muted mono">' + esc(sh.from) + ' → ' + esc(sh.till) + (nextDay ? ' ' + esc(t('shifts.nextDay')) : '') +
      '<br>' + esc(brk) + '</div></div>' +
      '<div>' + stripHtml(sh, r) + stripAxis + '</div>' + stripLegend() +
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

  // Form heading and save button follow the edit state; applyStaticText calls this so a language
  // switch or a reload mid-edit keeps "Edit Mon 05.10." instead of resetting to "Add shift".
  function renderFormHead() {
    const d = state.editing;
    $('form-title').textContent = d ? t('shifts.edit', { day: wd(d) + ' ' + dm(d) }) : t('shifts.add');
    $('f-save').textContent = t(d ? 'shifts.saveChanges' : 'shifts.save');
  }
  function resetForm(date, keepTimes) {
    state.editing = null;
    F.date.value = date || todayStr();
    F.status.value = 'worked';
    if (!keepTimes) { F.from.value = ''; F.till.value = ''; F.brk.value = S().defaultBreakMin; }
    F.bs.value = ''; F.note.value = '';
    renderFormHead();
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
    renderFormHead();
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sh.date)) return msg('f-msg', t('shifts.errDate'), true);
    if (sh.status === 'worked') {
      if (!sh.from || !sh.till) return msg('f-msg', t('shifts.errTimes'), true);
      if (F.bs.value.trim() && !sh.breakStart) return msg('f-msg', t('shifts.errBreakStart'), true);
      F.from.value = sh.from; F.till.value = sh.till;
    }
    const old = state.editing;
    try {
      await write('shifts/' + sh.date, sh);
      if (old && old !== sh.date) await write('shifts/' + old, null);
      msg('f-msg', t('shifts.saved', { date: wd(sh.date) + ' ' + dmy(sh.date) }));
      resetForm(C.addDays(sh.date, 1), true);
    } catch (err) { msg('f-msg', writeError(err), true); }
  });
  $('f-delete').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!arm(btn, t('common.confirmDelete'))) return;
    disarm(btn);
    const d = state.editing; if (!d) return;
    try { await write('shifts/' + d, null); msg('f-msg', t('shifts.deleted', { date: wd(d) + ' ' + dmy(d) })); resetForm(d, true); }
    catch (err) { msg('f-msg', writeError(err), true); }
  });
  $('f-cancel').addEventListener('click', () => { msg('f-msg', ''); resetForm(); });

  function renderShiftList() {
    const el = $('shift-list');
    const { all, weeks } = calc();
    if (!all.length) {
      el.innerHTML = '<div class="card empty">' + esc(state.loaded ? t('shifts.empty') : t('shifts.loading')) + '</div>';
      return;
    }
    const keys = Object.keys(weeks).sort().reverse();
    let html = '';
    for (const k of keys) {
      const w = weeks[k];
      const wk = C.isoWeek(w.items[0].shift.date);
      html += '<section class="week"><div class="week-head"><h3>' + esc(kw(wk.week)) + ' <span class="small muted" style="font-family:var(--body);font-weight:500">' + dm(wk.monday) + '–' + dm(wk.sunday) + '</span></h3>' +
        '<span class="num">' + hrs(w.paidH) + ' · ' + eur(w.gross) + '</span></div><div class="rows">';
      for (const it of w.items) {
        const sh = it.shift, r = it.r;
        const flags = r.warnings.length ? '<span class="flag" title="' + esc(r.warnings.map(warnText).join('\n')) + '">' + warnIcon + r.warnings.length + '</span>' : '';
        let mid, g;
        if (r.worked) {
          const extra = [t('shifts.rowPaid', { h: hrs(r.paidH) }), t('shifts.rowNight', { h: hrs(r.nightH) })];
          if (r.sundayH) extra.push(t('shifts.rowSunday', { h: hrs(r.sundayH) }));
          if (r.holidayH + r.eveH) extra.push(t('shifts.rowHoliday', { h: hrs(r.holidayH + r.eveH) }));
          mid = '<div class="times">' + esc(sh.from) + '–' + esc(sh.till) + flags + '</div>' + stripHtml(sh, r) + '<div class="meta">' + esc(extra.join(' · ')) + '</div>';
          g = eur(r.gross) + '<small>+' + eur(r.premium) + '</small>';
        } else {
          mid = '<div class="times"><span class="status">' + esc(STATUS[r.status] || r.status) + '</span></div>' + (sh.note ? '<div class="meta">' + esc(sh.note) + '</div>' : '');
          g = '<span class="muted">—</span>';
        }
        html += '<button type="button" class="row' + (state.editing === sh.date ? ' editing' : '') + '" data-date="' + sh.date + '" aria-label="' + esc(t('shifts.edit', { day: wd(sh.date) + ' ' + dm(sh.date) })) + '">' +
          '<div class="d">' + esc(wd(sh.date)) + '<small>' + dm(sh.date) + '</small></div><div class="mid">' + mid + '</div><div class="g">' + g + '</div></button>';
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
    let tip = chart.querySelector('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; chart.appendChild(tip); }
    tip.innerHTML = html; tip.hidden = false;
    const w = chart.clientWidth, tw = tip.offsetWidth;
    const left = Math.max(tw / 2, Math.min(w - tw / 2, x));
    tip.style.left = left + 'px'; tip.style.top = y + 'px';
  }
  function hideTip(chart) { const tip = chart.querySelector('.tip'); if (tip) tip.hidden = true; }
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
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('summary.chartAria')) + '">';
    for (let v = 0; v <= top + 1e-9; v += step) {
      s += '<line class="' + (v === 0 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + (v >= 1000 ? n2(v / 1000).replace(/,00$/, '') + 'k' : Math.round(v)) + '</text>';
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
    s += '<text x="' + L + '" y="' + (H - 8) + '" text-anchor="end" dx="-6">' + esc(t('common.kwAxis')) + '</text></svg>';
    el.innerHTML = s;
    const svg = el.querySelector('svg');
    const scale = () => el.clientWidth / W;
    svg.addEventListener('pointermove', (e) => {
      const r = e.target.closest('.hit'); if (!r) return hideTip(el);
      const b = bars[+r.dataset.i], i = +r.dataset.i;
      const cx = (L + slot * i + slot / 2) * scale(), ty = y(b.base + b.bonus) * scale();
      showTip(el, cx, ty, '<div>' + esc(b.title) + '</div><b>' + eur(b.base + b.bonus) + '</b> ' + esc(t('summary.tipGross')) + '<br>' +
        esc(t('summary.tipBase')) + ' <b>' + eur(b.base) + '</b> · ' + esc(t('summary.tipBonus')) + ' <b>' + eur(b.bonus) + '</b>');
    });
    svg.addEventListener('pointerleave', () => hideTip(el));
    if (onPick) svg.addEventListener('click', (e) => { const r = e.target.closest('.hit'); if (r) onPick(bars[+r.dataset.i]); });
  }

  function lineChart(el, pts) {
    const W = Math.max(280, el.clientWidth || 600), H = 200, L = 52, R = 14, T = 14, B = 26;
    const iw = W - L - R, ih = H - T - B;
    if (!pts.length) { el.innerHTML = '<p class="empty">' + esc(t('account.noDays')) + '</p>'; return; }
    let lo = Math.min(0, ...pts.map((p) => p.balance)), hi = Math.max(0, ...pts.map((p) => p.balance));
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => L + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('account.chartAria')) + '">';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const vv = Math.round(v * 1000) / 1000;
      s += '<line class="' + (vv === 0 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(vv) + '" y2="' + y(vv) + '"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y(vv) + 3) + '" text-anchor="end">' + (vv > 0 ? '+' : vv < 0 ? '−' : '') + Math.abs(Math.round(vv)) + '</text>';
    }
    pts.forEach((p, i) => {
      if (p.date.slice(8) === '01' || i === 0) {
        s += '<line class="grid" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (T + ih) + '" stroke-dasharray="2 3"/>';
        s += '<text x="' + (x(i) + 3) + '" y="' + (H - 8) + '">' + esc(monthShort(p.date.slice(0, 7))) + '</text>';
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
      showTip(el, x(i) / k, y(p.balance) / k, '<div>' + esc(wd(p.date)) + ' ' + dmy(p.date) + '</div>' + esc(t('account.tipBalance')) + ' <b>' + sHrs(p.balance) + '</b><br>' +
        esc(t('account.tipWorked')) + ' <b>' + hrs(p.worked) + '</b> · ' + esc(t('account.soll')) + ' <b>' + hrs(p.target) + '</b>');
    });
    svg.addEventListener('pointerleave', () => { hideTip(el); xh.setAttribute('visibility', 'hidden'); xd.setAttribute('visibility', 'hidden'); });
  }

  // ---------- Summary tab ----------
  function weekLabel(key, items) {
    const wk = C.isoWeek(items && items.length ? items[0].shift.date : todayStr());
    return kw(wk.week) + ' · ' + dm(wk.monday) + '–' + dmy(wk.sunday);
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
      sel.innerHTML = '<option>' + esc(t('summary.noShifts')) + '</option>'; sel.disabled = true;
      $('sum-tiles').innerHTML = ''; $('sum-table').innerHTML = '<p class="empty">' + esc(t('summary.empty')) + '</p>';
      $('chart-weeks').innerHTML = '';
      return;
    }
    sel.disabled = false;
    const todayKey = mode === 'week' ? C.isoWeek(todayStr()).key : todayStr().slice(0, 7);
    if (!state.sumKey || !map[state.sumKey]) state.sumKey = map[todayKey] ? todayKey : keys[0];
    sel.innerHTML = keys.map((k) => '<option value="' + k + '"' + (k === state.sumKey ? ' selected' : '') + '>' +
      esc(mode === 'week' ? weekLabel(k, map[k].items) : monthName(k)) + '</option>').join('');
    const tot = map[state.sumKey];
    const s = S();
    const ratioNote = t(s.netRatioCalibrated ? 'summary.ratioCalibrated' : 'summary.ratioDefault', { r: nf4.format(s.netRatio) });
    const tile = (label, v, sub) => '<div class="tile"><span class="label">' + esc(label) + '</span><b>' + v + '</b><small>' + esc(sub) + '</small></div>';
    $('sum-tiles').innerHTML =
      tile(t('summary.hours'), n2(tot.paidH), t(tot.shifts === 1 ? 'summary.shiftsWorkedOne' : 'summary.shiftsWorked', { n: tot.shifts })) +
      tile(t('summary.gross'), eur(tot.gross), t('summary.avg', { v: eur(tot.avgPerH) })) +
      tile(t('summary.net'), eur(tot.net), ratioNote) +
      tile(t('summary.bonuses'), eur(tot.premium), t('summary.taxFree'));
    const pb = tot.premiumBreakdown;
    const row = (name, pct, h, v) => '<tr><td>' + esc(name) + '</td><td>' + pct + '</td><td>' + hrs(h) + '</td><td>' + eur(v) + '</td></tr>';
    const rate = C.rateFor(tot.items[0].shift.date, s);
    $('sum-table').innerHTML = '<table><thead><tr><th>' + esc(t('summary.colType')) + '</th><th>' + esc(t('summary.colRate')) + '</th><th>' + esc(t('summary.colHours')) +
      '</th><th>' + esc(t('summary.colAmount')) + '</th></tr></thead><tbody>' +
      row(t('summary.rowNight'), s.nightPct + ' %', tot.nightH, pb.night) +
      row(t('summary.rowSunday'), s.sundayPct + ' %', tot.sundayH, pb.sunday) +
      row(t('summary.rowHoliday'), s.holidayPct + ' %', tot.holidayH, pb.holiday) +
      row(t('summary.rowEve'), s.eveAfter14Pct + ' %', tot.eveH, pb.eve) +
      '<tr class="total"><td>' + esc(t('summary.bonuses')) + '</td><td></td><td>' + hrs(tot.bonusH) + '</td><td>' + eur(tot.premium) + '</td></tr>' +
      '<tr><td>' + esc(t('summary.basePay')) + '</td><td>' + eur(rate) + '</td><td>' + hrs(tot.paidH) + '</td><td>' + eur(tot.base) + '</td></tr>' +
      '<tr class="total"><td>' + esc(t('summary.gross')) + '</td><td></td><td></td><td>' + eur(tot.gross) + '</td></tr></tbody></table>' +
      '<p class="note">' + esc(t('summary.note')) + '</p>';
    $('sum-table-title').textContent = t('summary.breakdown') + ' · ' + (mode === 'week' ? kw(C.isoWeek(tot.items[0].shift.date).week) : monthName(state.sumKey));

    // weekly bars: from the assignment's first week to the latest entry
    const firstWk = C.isoWeek(s.assignmentStart).monday;
    const lastDate = all[all.length - 1].shift.date;
    const lastWk = C.isoWeek(lastDate > s.assignmentStart ? lastDate : s.assignmentStart).monday;
    const hlWeeks = new Set(mode === 'week' ? [state.sumKey] : tot.items.map((it) => C.isoWeek(it.shift.date).key));
    const bars = [];
    for (let d = firstWk; d <= lastWk && bars.length < 120; d = C.addDays(d, 7)) {
      const wk = C.isoWeek(d), w = weeks[wk.key];
      bars.push({ key: wk.key, label: String(wk.week), title: kw(wk.week) + ' · ' + dm(wk.monday) + '–' + dm(wk.sunday), base: w ? w.base : 0, bonus: w ? w.premium : 0, hl: hlWeeks.has(wk.key) });
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
    const tile = (label, v, sub, neg) => '<div class="tile' + (neg ? ' neg' : '') + '"><span class="label">' + esc(label) + '</span><b>' + v + '</b><small>' + esc(sub) + '</small></div>';
    $('acc-tiles').innerHTML =
      tile(t('account.balance'), sHrs(now), t('account.asOf', { date: dmy(upto) }), r2(now) < 0) +
      tile(t('account.sollMonth', { m: monthShort(curYm) }), n2(cur.target), t('account.workedSoFar', { h: hrs(cur.workedH) })) +
      tile(t('account.stillToWork'), n2(Math.max(0, cur.target - cur.workedH)), t('account.toReach', { month: monthName(curYm) })) +
      tile(t('account.cap'), '≈ ' + n2(ta.cap), t('account.capNote', { h: n2(s.weeklyHours) }));
    lineChart($('chart-balance'), pts);

    const ov = s.monthTargetOverride || {};
    const th = (k) => '<th>' + esc(t(k)) + '</th>';
    $('acc-table').innerHTML = !ta.rows.length ? '<p class="empty">' + esc(t('account.noMonths')) + '</p>' :
      '<table><thead><tr>' + th('account.colMonth') + th('account.soll') + th('account.colWorked') + '<th>Δ</th>' + th('account.balance') + '</tr></thead><tbody>' +
      ta.rows.map((r) => '<tr' + (r.ym === curYm ? ' class="cur"' : '') + '><td>' + esc(monthName(r.ym)) +
        (r.ym === curYm && upto < r.ym + '-' + pad(C.daysInMonth(r.ym)) ? ' <span class="small muted">' + esc(t('account.inProgress')) + '</span>' : '') +
        (ov[r.ym] != null ? ' <span class="small muted">' + esc(t('account.sollFromPayslip')) + '</span>' : '') + '</td>' +
        '<td>' + n2(r.target) + '</td><td>' + n2(r.workedH) + '</td><td class="' + (r2(r.delta) < 0 ? 'neg' : 'pos') + '">' + sHrs(r.delta).replace(' h', '') + '</td>' +
        '<td class="' + (r2(r.balance) < 0 ? 'neg' : 'pos') + '">' + sHrs(r.balance).replace(' h', '') + '</td></tr>').join('') +
      '</tbody></table><p class="note">' + esc(t('account.tableNote', { h: n2(C.absenceCreditH(s)) })) + '</p>';

    $('acc-compare').innerHTML = !ta.rows.length ? '' :
      '<table><thead><tr>' + th('account.colMonth') + th('account.colEarned') + th('account.colExpected') + th('account.colDiff') + th('account.colDeltaRate') + '</tr></thead><tbody>' +
      ta.rows.map((r) => {
        const p = C.expectedPayslip(r.ym, all, s);
        const diff = p.earnedValue - (p.fixedPay + p.bonuses);
        return '<tr><td>' + esc(monthName(r.ym)) + '</td><td>' + eur(p.earnedValue) + '</td><td>' + eur(p.expectedGross) +
          (p.overtimeEst ? '<br><span class="est">' + esc(t('account.inclOvertime', { v: eur(p.overtimeEst) })) + '</span>' : '') + '</td>' +
          '<td class="' + (r2(diff) < 0 ? 'neg' : 'pos') + '">' + sEur(diff) + '</td><td>' + sHrs(p.paidH - p.target).replace(' h', '') + ' × ' + n2(p.rate) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note">' + esc(t('account.compareTableNote')) + '</p>';
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
    $('ps-month').innerHTML = months.map((m) => '<option value="' + m + '"' + (m === ym ? ' selected' : '') + '>' + esc(monthName(m)) + (state.payslips[m] ? ' ✓' : '') + '</option>').join('');
    if (psFilled == null || psFilled.split('|')[0] !== ym || (psFilled !== ym + '|' + JSON.stringify(state.payslips[ym] || {}) && document.activeElement && !document.activeElement.closest('#ps-form'))) fillPayslipForm(ym);

    const s = S(), { all } = calc();
    const p = C.expectedPayslip(ym, all, s);
    const sNoOv = JSON.parse(JSON.stringify(s)); delete sNoOv.monthTargetOverride[ym];
    const formulaH = C.monthTarget(ym, sNoOv);
    const ta = C.timeAccount(all, s, ym);
    const taRow = ta.rows.find((r) => r.ym === ym);
    const a = state.payslips[ym] || {};
    const due = bankDay15(ym);
    $('ps-due').textContent = due ? t('payslip.due', { date: dmy(due) }) : '';
    const line = (name, exp, act, kind, sub) => {
      const fmt = kind === 'h' ? hrs : eur;
      let diff = '<span class="muted">—</span>';
      if (act != null && act !== '' && isFinite(+act)) {
        const d = +act - exp, ok = kind === 'h' ? Math.abs(d) <= 0.05 : Math.abs(d) <= 1;
        diff = '<span class="pill ' + (ok ? 'ok' : 'no') + '">' + (kind === 'h' ? sHrs(d) : sEur(d)) + '</span>';
      }
      return '<tr><td>' + esc(name) + (sub ? '<br><span class="est">' + esc(sub) + '</span>' : '') + '</td><td>' + fmt(exp) + '</td><td>' +
        (act != null && act !== '' ? fmt(+act) : '<span class="muted">—</span>') + '</td><td>' + diff + '</td></tr>';
    };
    $('ps-table').innerHTML = '<table><thead><tr><th>' + esc(monthName(ym)) + '</th><th>' + esc(t('payslip.colExpected')) + '</th><th>' + esc(t('payslip.colPayslip')) +
      '</th><th>' + esc(t('payslip.colDiff')) + '</th></tr></thead><tbody>' +
      line(t('payslip.rowGross'), p.expectedGross, a.grossTotal, 'eur', p.overtimeEst ? t('payslip.inclOvertime', { v: eur(p.overtimeEst) }) : '') +
      line(t('payslip.rowNet'), p.expectedNet, a.netTotal, 'eur', t('payslip.estimate')) +
      line(t('payslip.rowHours'), formulaH, a.hoursPaid, 'h', t('payslip.hoursSub', { h: n2(C.fullMonthTarget(s)), days: C.assignmentDaysIn(ym, s), dim: C.daysInMonth(ym) })) +
      line(t('payslip.rowBonuses'), p.bonuses + p.overtimeEst, a.premiumsPaid, 'eur', '') +
      line(t('payslip.rowBalance'), taRow ? taRow.balance : 0, a.timeAccountBalance, 'h', '') +
      '</tbody></table>' +
      '<p class="note">' + esc(t('payslip.note', { h: hrs(p.target), rate: eur(p.rate), fixed: eur(p.fixedPay), bonuses: eur(p.bonuses) }) +
        (p.overtimeH ? t('payslip.noteOvertime', { n: p.overtimeH, threshold: hrs(p.threshold) }) : '') + t('payslip.noteGreen')) + '</p>';
    $('ps-ratio').textContent = t(s.netRatioCalibrated ? 'payslip.ratioCalibrated' : 'payslip.ratioDefault', { r: nf4.format(s.netRatio) });
  }
  $('ps-month').addEventListener('change', (e) => { state.psYm = e.target.value; psFilled = null; msg('ps-msg', ''); renderPayslip(); });
  $('ps-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ym = state.psYm;
    const vals = { grossTotal: parseNum(P.gross.value), netTotal: parseNum(P.net.value), hoursPaid: parseNum(P.hours.value), premiumsPaid: parseNum(P.prem.value), timeAccountBalance: parseNum(P.bal.value) };
    for (const k in vals) if (Number.isNaN(vals[k])) return msg('ps-msg', t('payslip.errNum'), true);
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
      msg('ps-msg', t('payslip.saved', { month: monthName(ym) }) + (ns.netRatioCalibrated && vals.grossTotal && vals.netTotal ? ' ' + t('payslip.calibrated', { r: nf4.format(ns.netRatio) }) : ''));
    } catch (err) { msg('ps-msg', writeError(err), true); }
  });
  $('ps-delete').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!arm(btn, t('common.confirmDelete'))) return;
    disarm(btn);
    const ym = state.psYm;
    const ns = JSON.parse(JSON.stringify(S()));
    delete ns.monthTargetOverride[ym];
    try {
      await write('payslips/' + ym, null);
      if (JSON.stringify(ns) !== JSON.stringify(S())) await write('settings/settings', ns);
      psFilled = null; msg('ps-msg', t('payslip.deleted', { month: monthName(ym) }));
    } catch (err) { msg('ps-msg', writeError(err), true); }
  });

  // ---------- Settings ----------
  const SET_NUM = ['nightPct', 'sundayPct', 'holidayPct', 'eveAfter14Pct', 'overtimePct', 'weeklyHours', 'weeksPerMonth', 'defaultBreakMin', 'netRatio'];
  function rateRow(p) {
    return '<div class="rp"><label class="field"><span>' + esc(t('settings.validFrom')) + '</span><input type="date" class="rp-from" value="' + esc(p.from) + '"></label>' +
      '<label class="field"><span>' + esc(t('settings.perHour')) + '</span><input class="rp-rate" inputmode="decimal" value="' + esc(numIn(p.rate)) + '"></label>' +
      '<button class="btn rp-del" type="button" aria-label="' + esc(t('settings.removeRateAria')) + '">' + esc(t('settings.remove')) + '</button></div>';
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
  // The field's visible label, for error messages ("Check the value for Night.").
  const fieldLabel = (id) => { const sp = $(id).closest('label').querySelector('span'); return sp ? sp.textContent : id; };
  function readSettings() {
    const s = JSON.parse(JSON.stringify(S()));
    const err = (text) => { throw new Error(text); };
    s.ratePeriods = [...$('set-rates').querySelectorAll('.rp')].map((row) => {
      const from = row.querySelector('.rp-from').value, rate = parseNum(row.querySelector('.rp-rate').value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !(rate > 0)) err(t('settings.errRate'));
      return { from, rate };
    }).sort((a, b) => (a.from < b.from ? -1 : 1));
    if (!s.ratePeriods.length) err(t('settings.errNoRate'));
    for (const k of SET_NUM) { const v = parseNum($('s-' + k).value); if (v == null || isNaN(v) || v < 0) err(t('settings.errNum', { field: fieldLabel('s-' + k) })); s[k] = v; }
    if (s.netRatio > 1) err(t('settings.errNetRatio'));
    for (const k of ['nightStart', 'nightEnd']) { const hm = normTime($('s-' + k).value); if (!hm) err(t('settings.errNight')); s[k] = hm; }
    s.assignmentStart = $('s-assignmentStart').value || err(t('settings.errStart'));
    s.assignmentEnd = $('s-assignmentEnd').value || '';
    const ac = parseNum($('s-absenceCreditH').value);
    if (ac == null) delete s.absenceCreditH; else if (isNaN(ac) || ac < 0) err(t('settings.errCredit')); else s.absenceCreditH = ac;
    s.breakPaid = $('s-breakPaid').checked; s.netRatioCalibrated = $('s-netRatioCalibrated').checked;
    const dates = (id) => $(id).value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(x)) x = x.slice(6) + '-' + x.slice(3, 5) + '-' + x.slice(0, 2);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) err(t('settings.errDate', { value: x }));
      return x;
    }).sort();
    s.holidays = dates('s-holidays'); s.eveDates = dates('s-eveDates');
    s.monthTargetOverride = {};
    for (const ln of $('s-overrides').value.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(\d{4}-\d{2})\s*[=:]\s*([\d.,]+)$/.exec(ln);
      if (!m) err(t('settings.errOverride'));
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
    try { await write('settings/settings', s); msg('set-msg', t('settings.saved')); }
    catch (err) { msg('set-msg', writeError(err), true); }
  });
  $('set-reset').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!arm(btn, t('settings.confirmReset'))) return;
    disarm(btn);
    // Contract values go back to the defaults; the person's own app choices (language, job label, reminder) stay.
    const cur = S();
    const s = { ...defaults(), lang: cur.lang, jobLabel: cur.jobLabel, backupReminderDays: cur.backupReminderDays };
    try { await write('settings/settings', s); fillSettings(S()); msg('set-msg', t('settings.resetDone')); }
    catch (err) { msg('set-msg', writeError(err), true); }
  });

  // ---------- CSV export ----------
  function buildCsv() {
    const num = (x, d) => (x == null || x === '' ? '' : (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','));
    const q = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = t('csv.head').split(';');
    const lines = [head.join(';')];
    for (const { shift: sh, r } of calc().all) {
      lines.push([dmy(sh.date), wd(sh.date), STATUS[r.status] || r.status, sh.from || '', sh.till || '', r.worked ? r.breakMin : '', r.breakFrom || '',
        num(r.paidH, 2), num(r.nightH, 2), num(r.sundayH, 2), num(r.holidayH, 2), num(r.eveH, 2), r.worked ? num(r.rate, 2) : '',
        num(r.base, 2), num(r.premium, 2), num(r.gross, 2), r.warnings.map(warnText).join(' | '), sh.note || ''].map(q).join(';'));
    }
    return lines.join('\r\n') + '\r\n';
  }

  // Offers a file: the share sheet when files can be shared (iPhone, Android), otherwise a normal download.
  // Call it without awaiting anything before it inside a tap handler (iOS needs the tap's user activation).
  async function shareFile(name, text, mime) {
    const file = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; throw e; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  }

  $('csv-btn').addEventListener('click', () => {
    const name = 'shift-log-' + todayStr() + '.csv';
    shareFile(name, '﻿' + buildCsv(), 'text/csv').then(
      (r) => msg('csv-msg', r === 'cancelled' ? t('csv.cancelled') : t('csv.saved', { name })),
      () => { $('csv-box').hidden = false; $('csv-text').value = buildCsv(); msg('csv-msg', t('csv.fallback')); });
  });
  $('csv-copy').addEventListener('click', () => {
    const ta = $('csv-text');
    const sel = () => { ta.focus(); ta.select(); msg('csv-msg', t('csv.selected')); };
    try { navigator.clipboard.writeText(ta.value).then(() => msg('csv-msg', t('csv.copied')), sel); } catch (e) { sel(); }
  });

  // ---------- tabs ----------
  const TABS = ['shifts', 'summary', 'account', 'payslip'];
  function renderTab() {
    if (state.tab === 'shifts') { renderChips(); renderShiftList(); }
    else if (state.tab === 'summary') renderSummary();
    else if (state.tab === 'account') renderAccount();
    else if (state.tab === 'payslip') renderPayslip();
  }
  function setTab(tab, noScroll) {
    if (!TABS.includes(tab)) tab = 'shifts';
    state.tab = tab;
    for (const x of TABS) $('tab-' + x).hidden = x !== tab;
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.tab === tab);
    try { localStorage.setItem('shiftlog-tab', tab); } catch (e) { /* ignore */ }
    renderTab();
    if (!noScroll) window.scrollTo(0, 0);
  }
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.tab === 'summary' || state.tab === 'account') renderTab(); }, 150); });

  // ---------- boot ----------
  async function boot() {
    I18n.setLang(I18n.detectLang(navigator.language));
    applyStaticText();
    F.date.value = todayStr();
    F.brk.value = Calc.defaultSettings().defaultBreakMin;
    let start = (location.hash || '').slice(1);
    if (!TABS.includes(start)) { try { start = localStorage.getItem('shiftlog-tab') || 'shifts'; } catch (e) { start = 'shifts'; } }
    try {
      store = await Store.openStore();
    } catch (e) {
      // Render the empty tabs first (renderPreview re-enables the time fields), then lock the inputs.
      state.loaded = true;
      setTab(start, true);
      renderPreview();
      showNoStorage();
      return;
    }
    await reload();
    F.brk.value = S().defaultBreakMin;
    setTab(start, true);
    renderPreview();
  }

  function showNoStorage() {
    $('banners').innerHTML = '<div class="banner bad" role="alert"><p>' + esc(t('banner.noStorage')) + '</p></div>';
    for (const el of document.querySelectorAll('main input, main select, main button[type=submit]')) el.disabled = true;
  }

  boot();
})();
