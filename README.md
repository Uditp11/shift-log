# Shift Log

Shift and pay tracker for Adecco temp workers at Deutsche Post Obertshausen. Works offline from the Home Screen on iPhone and Android; all data stays on your phone.

## Install on iPhone
1. Open the link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. From now on open **Shift Log** from the new icon.

## Install on Android
1. Open the link in **Chrome**.
2. Tap the **⋮** menu → **Add to Home screen** (or **Install app**) → **Install**.
3. From now on open **Shift Log** from the new icon.

On iPhone, deleting the icon deletes your data; on Android, clearing Chrome's site data does. Use **Settings → Save backup** now and then and keep the file somewhere safe: iCloud Drive on iPhone, Google Drive or Files on Android.

## Develop
- `npm test`: unit tests (pay engine, formatting, language, backup, storage)
- `npm run e2e`: end-to-end tests in WebKit at iPhone size
- Every push to `main` runs the tests and deploys to GitHub Pages.
