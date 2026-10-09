# Shift Log App (friends' version): Design Spec

**Owner:** Udit Parihar · **Written:** 2026-10-09 · **Status:** design approved in chat, spec awaiting review
**Builds on:** `warehouse-timesheet-spec-and-plan.md` (the calc rules) and the published Shift Log artifact (`Adecco_job\shift-log\`, 36 passing tests)

---

## 1. Intent

### 1.1 What Udit said
- Coworkers want the same Shift Log for their own shifts. They have **exactly the same contract** (Adecco → Deutsche Post AG Obertshausen, GVP EG1). More coworkers may join later, so **every setting stays editable**, with Udit's contract as the default.
- They use **iPhones**. No App Store install and nothing iOS could flag.
- **No account.** Data lives on each person's phone and must not get lost over months.
- They need **all four tabs**: Shifts + live pay, Summary + charts, Time account, Payslip check.
- **English + German** toggle.
- Hosted on **GitHub Pages**.
- Udit's own data: **decide later**. The backup format must be able to take his artifact's data whenever he wants to move over.

### 1.2 Assumptions (stated in chat, not corrected)
- Friends set the app up themselves from a link Udit sends.
- No data leaves the phone: no server, no analytics, no third-party requests at run time.
- One phone per person. Moving to a new phone works through a backup file.
- `calc.js` and its tests are reused **unchanged**.

### 1.3 Success
A friend adds the app to the Home Screen in under a minute, enters a shift and gets the numbers in the original spec §7. Their data survives months of use, app updates and a phone change (via backup).

---

## 2. Approach (chosen: plain web app)

A static **home-screen web app** (PWA): plain HTML/CSS/JS modules, no framework, no build step, deployed by GitHub Actions to GitHub Pages. Opened once in Safari, then *Share → Add to Home Screen*; after that it runs full-screen and offline from its own icon.

Rejected:
- **Angular/Svelte rebuild:** a build pipeline and a UI rewrite with no user-visible gain at this size.
- **Cloud sync (Supabase):** brings back accounts, a server and GDPR obligations for salary data. Out of scope. The backup format is versioned so sync could be added later without breaking files.

---

## 3. Architecture

```
shift-log-app/
  index.html              page shell, <link rel=manifest>, apple-touch-icon, loads src/app.js as a module
  manifest.webmanifest    name "Shift Log", display standalone, icons, theme colours
  sw.js                   service worker: versioned app-shell cache
  icons/                  icon-180.png (apple-touch), icon-192.png, icon-512.png, icon.svg (source)
  src/
    calc.js               pay engine — byte-for-byte copy of Adecco_job/shift-log/calc.js
    store.js              IndexedDB persistence
    backup.js             backup file build / parse / validate / migrate / merge (pure)
    i18n.js               EN/DE strings + t(key, vars)
    format.js             de-DE number/€/hours/date formatting (pure; extracted from the artifact's app.js)
    app.js                UI: onboarding, 4 tabs, settings, banners
    version.js            export const APP_VERSION = "1.0.0"
  tests/
    calc.test.js          the existing 36 tests, unchanged
    backup.test.js, store.test.js, i18n.test.js, format.test.js
    e2e/*.spec.js         Playwright, WebKit project
  .github/workflows/pages.yml   test → deploy
  package.json            dev deps only: playwright, fake-indexeddb
```

| Unit | Job | Interface | Depends on |
|---|---|---|---|
| `calc.js` | All pay maths | as today (`calcShift`, `calcAll`, `weekTotals`, `monthTotals`, `timeAccount`, `expectedPayslip`, `dailyBalance`, `netEstimate`, `calibrate`, `defaultSettings`, …) | nothing |
| `store.js` | Read/write records on the device | `openStore(idb?)` → `{ getAll(), putShift(doc), deleteShift(date), putPayslip(doc), deletePayslip(ym), putSettings(s), getMeta(), setMeta(patch), replaceAll(data), saveUndo(), restoreUndo(), hasUndo(), requestPersist(), isPersisted() }` | IndexedDB (injectable for tests) |
| `backup.js` | Backup file logic | `buildBackup(data, now, appVersion)` → object; `parseBackup(text)` → `{ok, data, summary}` or `{ok:false, error}`; `mergeMissing(current, incoming)` → data | nothing |
| `i18n.js` | Text | `setLang('en'|'de')`, `t(key, vars)`, `STRINGS` | nothing |
| `format.js` | Display formats | `eur`, `sEur`, `hrs`, `sHrs`, `n2`, `dm`, `dmy`, `wd(lang)`, `monthName(lang)`, `normTime`, `parseNum` | nothing |
| `app.js` | Screens | — | all of the above |
| `sw.js` | Offline + updates | message `SKIP_WAITING` | Cache API |

`calc.js` is copied, not rewritten. Any calc change happens in one place and is copied across with its tests.

---

## 4. Data model

### 4.1 Records (same shapes as the artifact's `db` documents)
| Store | Key | Fields |
|---|---|---|
| `shifts` | `date` "YYYY-MM-DD" (shift start) | `date`, `from` "HH:MM", `till` "HH:MM", `breakMin`, `breakStart` "HH:MM"\|null, `status` worked/dayoff/sick/vacation, `note` |
| `payslips` | `month` "YYYY-MM" | `month`, `grossTotal`, `netTotal`, `hoursPaid`, `premiumsPaid`, `timeAccountBalance`, `note` (numbers or null) |
| `settings` | `"settings"` | everything in `calc.defaultSettings()` plus `absenceCreditH` (optional) and the new keys below |
| `meta` | `"meta"` | `schemaVersion` (1), `onboarded` (bool), `lastBackupAt` (ISO or null), `lastChangeAt` (ISO), `persistAsked` (bool) |
| `undo` | `"beforeRestore"` | full snapshot `{shifts, payslips, settings, takenAt}` (at most one) |

New settings keys (with defaults): `lang` (from `navigator.language`: "de" if it starts with "de", else "en"), `jobLabel` ("Lagerhelfer · Deutsche Post Obertshausen · via Adecco"), `backupReminderDays` (7).

### 4.2 IndexedDB
Database `shift-log`, version 1, one object store per table above. Every user action is one transaction; `lastChangeAt` is updated in the same transaction. Future layout changes go through numbered `onupgradeneeded` migrations, each with a test.

### 4.3 Backup file
```json
{
  "format": "shift-log-backup",
  "version": 1,
  "exportedAt": "2026-10-09T18:30:00.000Z",
  "appVersion": "1.0.0",
  "settings": { ... },
  "shifts": [ { "date": "2026-10-05", "from": "22:00", ... } ],
  "payslips": [ { "month": "2026-10", ... } ]
}
```
- File name: `shift-log-backup-YYYY-MM-DD.json`.
- `parseBackup` refuses: invalid JSON; a missing or wrong `format`; `version` greater than supported ("This backup is from a newer Shift Log. Update the app first."); records with malformed keys (each refusal names the first bad record). Unknown extra fields are kept.
- **Artifact compatibility:** a payslip without `month` takes it from its `ym`/document id when provided as `{id, data}` pairs; `shifts`/`payslips` may also be given as objects keyed by id. (So a later "export" from the Claude artifact only has to dump its three collections.)

---

## 5. Data safety

1. **Write-through:** every change is committed to IndexedDB immediately. The UI only says "Saved" after the transaction completes.
2. **Persistent storage:** on first launch call `navigator.storage.persist()`. Settings → Storage shows `navigator.storage.persisted()`: "Kept permanently" / "May be cleared by iOS".
3. **Safari-tab banner:** when not standalone (`navigator.standalone !== true` and not `display-mode: standalone`), show a persistent banner with the 3 Add-to-Home-Screen steps and the reason (Safari can wipe a website's data after 7 days of not being used; home-screen apps are exempt).
4. **Backup:** *Save backup* builds the file and calls `navigator.share({ files: [file] })` when `navigator.canShare({files})` is true (iPhone → *Save to Files → iCloud Drive*). Otherwise it downloads via a blob link. `lastBackupAt` is set only after `share()` resolves or the download starts. A cancelled share keeps the old date.
5. **Reminder:** when `lastChangeAt > lastBackupAt` and `now − lastBackupAt > backupReminderDays` (or there has never been a backup and at least 3 shifts exist), show a banner on the Shifts tab with a *Save backup* button.
6. **Restore:** file picker (`<input type=file accept=".json,application/json">`) → `parseBackup` → preview ("58 shifts, 2 payslips, 05.10.2026 – 30.12.2026, saved 09.10.2026") → choose **Replace everything** or **Add missing entries only** (adds shifts/payslips whose key does not exist yet; settings untouched). Before applying, `saveUndo()` stores the current data. *Undo restore* is offered until the next restore.
7. **Onboarding states plainly:** "Your shifts are stored only on this iPhone. Deleting the app icon deletes them. Save a backup to iCloud Drive now and then."

---

## 6. Screens

### 6.1 First launch (when `meta.onboarded` is false)
1. **Language:** English / Deutsch (pre-selected from the phone).
2. **Contract:** card showing the Adecco/Deutsche Post EG1 defaults (rate €15,33 → €15,87 from 01.04.2027, 23,07 h/week, night 25 %, Sunday 50 %, holiday 100 %). Editable: assignment start, assignment end, hours per week. *More in Settings later.*
3. **Home Screen:** shown only when not standalone: steps + reason.
4. **Start:** *Add my first shift* or *Restore from a backup*.
Finishing sets `onboarded = true`, saves settings and requests persistent storage.

### 6.2 Tabs
Same as the artifact: **Shifts** (form with live pay preview, 36-hour shift bar, warnings, week list grouped by KW), **Summary** (Week/Month, tiles, gross-per-week stacked bars, bonus table), **Time account** (tiles, daily balance line, monthly table, earned value vs expected payslip), **Payslip check** (form, expected vs actual, calibrated net ratio). Changes:
- Status line: "Saved on this iPhone · last backup 3 days ago" (or "No backup yet", shown in warning colour).
- Header subtitle from `settings.jobLabel`.
- Empty state: "No shifts yet. Add your first one above."
- CSV export uses the same share/download path as backups (file `shift-log-YYYY-MM-DD.csv`, semicolon, decimal comma, BOM).
- The `db`/`downloads` artifact code paths are removed.

### 6.3 Settings
All existing settings, plus: **Language** (EN/DE switch, applies immediately), **Job label**, **Backup & restore** (Save backup, Restore from backup, Undo restore, last backup date, reminder days), **Storage** (persisted status, record counts), **About** (app version, link to the GitHub repo).

### 6.4 Language
`i18n.js` holds every UI string in `en` and `de`. Payroll terms stay German in both languages (*Soll, Arbeitszeitkonto, Zuschlag, KW, Lagerhelfer*). Numbers, money and dates always use German formats (`€ 1.234,56`, `05.10.2026`, 24-hour times). Weekday and month names follow the language. `<html lang>` follows the setting.

### 6.5 Look
Carries over the artifact's design (concrete/navy and night-blue themes, Big Shoulders Display / Public Sans / IBM Plex Mono, amber = bonus). Fonts are **self-hosted** in `fonts/` (WOFF2, OFL licence) so the app works offline and makes no third-party requests.

---

## 7. Errors (plain words, always with a next step)

| Situation | What the user sees |
|---|---|
| IndexedDB unavailable (e.g. Private Browsing) | Red banner: "This browser can't save data. Open Shift Log from your Home Screen icon (not a private tab)." Inputs disabled. |
| Write fails / quota exceeded | Message under the form: "Couldn't save on this iPhone: storage is full. Save a backup, then free up space." Form keeps the input. |
| Backup file invalid | The specific `parseBackup` error; nothing changes. |
| Share sheet cancelled | "Backup not saved." `lastBackupAt` unchanged. |
| New app version waiting | Banner: "New version available. Reload". Tapping sends `SKIP_WAITING` and reloads. |

---

## 8. Offline and updates

`sw.js` precaches the app shell (`index.html`, `manifest`, `src/*.js`, `fonts/*`, `icons/*`) under the cache `shift-log-<APP_VERSION>`. Navigation is network-first with a fallback to the cache (so updates arrive when online); static assets are cache-first. A new version installs in the background and waits for the reload banner. Old caches are deleted on `activate`. The service worker never touches IndexedDB.

---

## 9. Testing

**Unit (`node --test`):**
- `calc.test.js`: the 36 existing tests, unchanged. All §7 numbers must still match exactly.
- `backup.test.js`: build → parse round trip is identical; refuses bad JSON, wrong format, newer version and malformed records (each with the expected message); accepts the artifact shapes (`{id, data}` pairs, keyed objects); `mergeMissing` adds only absent keys and leaves settings alone.
- `store.test.js` (with `fake-indexeddb`): put/get/delete for each store; `lastChangeAt` updated; `replaceAll` + `saveUndo` + `restoreUndo` round trip; migration v0→v1 from an empty database.
- `i18n.test.js`: `en` and `de` have identical key sets; no empty strings; `{var}` placeholders match between languages.
- `format.test.js`: `eur(1234.565)` → "€ 1.234,57", negatives use "−", `normTime("2200")` → "22:00", `parseNum("1.234,56")` → 1234.56, …

**End-to-end (Playwright, WebKit, iPhone 15 viewport, light and dark, EN and DE):**
1. Onboarding → enter the seed week (§3.2 of the original spec) by hand → week shows **29,25 h · € 545,17**; previews show 147,55 / 127,43 / 122,64.
2. Reload → data still there.
3. Save backup (download path) → clear site data → restore the file → identical week totals; *Undo restore* brings back the pre-restore state.
4. Offline: with the network blocked after the first load, the app opens and a shift can be added.
5. No horizontal scroll at 390 px on any tab; no console errors.

**Manual (Udit, once per release that touches storage or the service worker):** add to a real iPhone, enter a shift, force-quit, reopen, save a backup to iCloud Drive.

---

## 10. Release

- GitHub repo `shift-log` (public, so GitHub Pages is free). The repo contains code only, never anyone's data.
- `.github/workflows/pages.yml`: on push to `main` → `npm ci` → unit tests → Playwright WebKit e2e → deploy to Pages. A failed step blocks the deploy.
- `APP_VERSION` is bumped on every release. It is shown in Settings → About and names the service-worker cache.
- Udit sends friends the Pages URL plus a 3-line "how to install" message.

---

## 11. Out of scope

Accounts or sync, push notifications, an App Store / TestFlight build, an Android-specific check (should work, not tested), multiple jobs per person, and changes to the existing Claude artifact (a JSON export there is a separate small task once Udit decides to move).

## 12. Open points (don't block the build)
- The October payslip may change defaults (break paid? Soll method?). Defaults change in `calc.defaultSettings()`; existing users keep their saved settings and can press *Reset to contract defaults*.
- The 2027 Hessen holidays should be checked before the assignment is extended.
