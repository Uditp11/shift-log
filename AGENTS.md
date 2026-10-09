# Shift Log

Home-screen web app (GitHub Pages, iPhone first) where Adecco temps at Deutsche Post Obertshausen track shifts, pay, Arbeitszeitkonto and payslips. All data stays on the phone (IndexedDB) plus backup files.

Before any work, read your task in `docs/superpowers/plans/2026-10-09-shift-log-app.md` (Global Constraints apply to every task) and the spec it names. The spec decides what the app does; the plan decides how.

## Working rules
- One task = one thread = one branch `task-<n>-<slug>` = one pull request. Merge order follows the plan's wave table.
- Test first: the failing test goes in before the code, and you watch it fail.
- `src/calc.js` is the pay engine, frozen and copied from the Claude artifact. Its 36 tests carry the exact numbers from the contract spec; change it only through a new failing test, and keep all 36 green.
- Every `src/*.js` file is a classic script with the same UMD wrapper as `calc.js` (browser global, `module.exports` in Node). No ES modules, no bundler, no framework.
- Every visible string goes through `I18n.t()` with the key present in both `en` and `de`. Money, numbers and dates are German-formatted in both languages; Soll, Arbeitszeitkonto, Zuschlag and KW stay German.
- The app makes no network requests to other sites: fonts, icons and scripts are files in this repo.
- Inside a tap handler, call `navigator.share()` before any `await`: iOS drops the tap's permission after the first async gap.
- The look stays as ported from the artifact. Visual redesign is a later, separate plan.
- If your workspace can't reach npm, write the code and tests anyway, push, and let the pull request's CI run them; say so in the PR description.

## Pull request description
Task number and title, what changed, the test command you ran and its result, and every decision the plan did not cover, written as `Ruling: <what> — <why>`.
