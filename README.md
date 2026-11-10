# ⚡ SubMeter Bill — Android app for one tenant, one sub-meter, ₹11/unit

Offline-first Android app (built with Capacitor). You do **not** need Android Studio:
GitHub builds the APK for you in the cloud, free.

**What it does**
- Camera / gallery meter photo → offline OCR suggests the reading → **you confirm or correct it**
- Bill = (current − previous) × rate (default ₹11, editable in Settings)
- Home dashboard, 12-month calendar with bills + per-date notes, history with charts, CSV/PDF export
- Reminder notification on the 1st of every month (survives phone restarts) + optional follow-ups
- WhatsApp messages for up to 5 saved numbers (editable templates, you press send)
- Payments: cash/UPI/bank/other, partial payments, balance, history
- Backup / restore, dark and light theme. All data stays on the phone.

---

## Part 1 — Put the project on GitHub (about 10 minutes)

1. Create a free account at <https://github.com> and sign in.
2. Click the **+** (top right) → **New repository**. Name it `submeter-bill`. Keep it **Public** or **Private** (both work). Click **Create repository**.
3. **Unzip** the project folder on your computer.
4. On the new empty repository page click **uploading an existing file**.
5. Open the unzipped `submeter-bill` folder and **drag everything inside it** (not the folder itself) into the browser: `www`, `scripts`, `tests`, `package.json`, `capacitor.config.json`, `README.md`, `.gitignore`, `.github` …
6. Click **Commit changes**.

### ⚠ Important: the hidden `.github` folder
Windows/Mac often hide folders starting with a dot, so `.github` may not get uploaded. Check: on your repo page you should see a `.github` folder. If it is missing:

1. In the repo click **Add file → Create new file**.
2. In the name box type exactly: `.github/workflows/build-apk.yml` (typing the `/` creates the folders).
3. Open `GITHUB_WORKFLOW_COPY/build-apk.yml` from the zip, copy all its text and paste it into the big box.
4. Click **Commit changes**.

## Part 2 — Build and download the APK

1. In your repo click the **Actions** tab. (If GitHub shows a green “I understand my workflows, enable them” button, click it.)
2. The **Build Debug APK** run starts automatically after you commit. If it doesn't: click **Build Debug APK** in the left list → **Run workflow** → **Run workflow**.
3. Wait about **6–12 minutes** for a green ✔ (yellow = still running).
4. Click the finished run. Scroll to **Artifacts** at the bottom and click **SubMeterBill-debug-apk**. A zip downloads — unzip it to get `app-debug.apk`.
   (You must be logged in to GitHub to download artifacts. They are kept for 90 days; just re-run the workflow for a new one.)

## Part 3 — Install on your phone

1. Copy `app-debug.apk` to the phone (WhatsApp-to-self, Google Drive, USB…).
2. Tap it. Android will ask to allow **Install unknown apps** for the app you opened it from — allow it.
3. If Play Protect says “unrecognised developer” choose **Install anyway** (it is your own debug build).
4. Open **SubMeter Bill** → fill the setup screen (tenant, room, WhatsApp number, initial reading, optional photo).
5. Allow **Notifications** and **Camera** when asked.

## Monthly routine
1. 1st of month → notification → tap it.
2. Take the meter photo → check the detected number against the photo → fix it if needed → **Confirm**.
3. The bill appears; choose **Send on WhatsApp**, press send in WhatsApp.
4. When money arrives: open the month → **Payment**.

*Billing month = the month you take the reading in* (reading on 1 Nov → “November 2026”). You can pick another month on the upload screen.

---

## Good to know (honest limits)
- **OCR is a suggestion.** It runs offline (Tesseract) and works best on clear, straight, well-lit photos. Digital LCD / 7-segment displays are the hardest, so always check the number — the app never saves a reading without your confirmation. If the engine fails, you can still type the reading.
- **WhatsApp can't be sent silently** (Android doesn't allow it). The app opens WhatsApp with the message ready for each number; you press send, come back, tap **Next**.
- **Reminders:** if notifications don't appear, in Android Settings → Apps → SubMeter Bill → Notifications = ON, and set Battery to “Unrestricted”. Use Settings → **Send test (5 sec)** to check.
- This is a **Capacitor** app (web UI inside a native Android shell), not a Kotlin/Compose app. Camera, notifications, file sharing and WhatsApp launching use real native plugins.
- It is a **debug APK** (signed with the standard debug key) — fine for personal use. It is not a Play Store release.
- Back up regularly: Settings → **Backup** (saves readings, payments and photos into one file you can share to Drive).

## Troubleshooting the build
| Problem | Fix |
|---|---|
| No “Actions” runs appear | Make sure `.github/workflows/build-apk.yml` exists (see the hidden-folder note), then **Run workflow** |
| Red ✗ on a step | Click the run → click the red step → copy the last 30 lines of the log and send them to me |
| Can't find the APK | Run page → scroll to the bottom → **Artifacts** |
| “App not installed” | Uninstall any older copy first, then install again |

## For developers
```
npm install
npm test                    # billing logic tests
npm run prepare:web         # copies OCR engine + PDF lib into www/vendor
npx cap add android && node scripts/patch-android.js
npx cap sync android        # then open /android in Android Studio, or: cd android && ./gradlew assembleDebug
```
Files: `www/js/core.js` (data + billing), `ocr.js`, `reminders.js`, `app.js` (screens). The `android/` folder is generated in CI and is intentionally not committed.
