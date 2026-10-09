# Setting up the Shift Log project

Everything in this folder is the seed for the GitHub repo. The plan has 9 tasks in 5 waves; each task gets its own chat ("thread") in the Claude project and its own branch + pull request in GitHub.

## 1. Create the GitHub repo (2 minutes)
1. On github.com: **New repository** → name `shift-log` → **Public** (free GitHub Pages needs public; the repo only ever holds code, never anyone's shifts) → leave "Add a README" **unticked** → **Create repository**.
2. On the empty repo page click **uploading an existing file**, drag in the **contents** of this folder (`AGENTS.md`, `PROJECT-SETUP.md`, `docs/`, `reference/`) and **Commit changes** to `main`.

## 2. Create the Claude project
1. **Projects** → **New project** → name it `Shift Log App`.
2. **Set project instructions**: paste the block below (replace `<your-github-name>`).
3. Add to the project knowledge: `AGENTS.md`, `docs/superpowers/specs/2026-10-09-shift-log-app-design.md`, `docs/superpowers/plans/2026-10-09-shift-log-app.md`.

```
This project builds Shift Log, a home-screen web app for iPhone (GitHub Pages) where Adecco temps at Deutsche Post Obertshausen track their shifts, pay, time account and payslips. Data stays on the phone.

Repo: github.com/<your-github-name>/shift-log (attach it to the session and work there).

Each chat implements exactly ONE task from the implementation plan in project knowledge (2026-10-09-shift-log-app.md), on its own branch task-<n>-<slug>, and finishes with a pull request whose CI is green. Read AGENTS.md, then your task, then the spec. Use superpowers:executing-plans with test-driven development. Follow the plan's Global Constraints. Record any decision the plan doesn't cover as "Ruling: <what> — <why>" in the PR description.

Not in scope here: the visual redesign (a later, separate plan).
```

## 3. Run the waves

| Wave | Open these chats | Start when |
|---|---|---|
| 1 | Task 1 | now |
| 2 | Tasks 2, 3, 4, 5, 6 (five chats at once) | Task 1's PR is merged **and** you've set **repo Settings → Pages → Source: GitHub Actions** |
| 3 | Task 7 | all five wave-2 PRs are merged |
| 4 | Task 8 | Task 7 merged |
| 5 | Task 9 | Task 8 merged; then do the real-iPhone check in Task 9, step 6 |

**Opening message for each chat** (change the number and name):

```
Implement Task 4 (backup.js) from the plan. Repo: github.com/<your-github-name>/shift-log. Work on branch task-4-backup, open a pull request when the task's tests pass, and reply with the PR link, the test command you ran and its result, and any Rulings.
```

Task names: 1 skeleton · 2 format · 3 i18n · 4 backup · 5 store · 6 shell · 7 port-tabs · 8 onboarding-backup · 9 e2e-release.

## 4. Reviewing and merging
- Merge a PR when its checks are green and the description shows the test results. Wave-2 PRs touch different files, so merge them in any order.
- If two PRs conflict, ask the later chat to rebase on `main` and push again.
- After Task 9 merges, the live link is `https://<your-github-name>.github.io/shift-log/`. Open it in Safari on your iPhone, do the check in Task 9 step 6, then send it to your friends with the three install steps from `README.md`.

## Later
The UI upgrade (taste-skill / ui-ux-pro-max) is its own brainstorm → spec → plan once this version works. The end-to-end tests from Task 9 keep the redesign from breaking anything.
