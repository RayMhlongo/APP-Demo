# CreamTrack Vendor (APP-Demo Refactor)

CreamTrack Vendor is a mobile-first PWA for small vendors to track daily sales, missed trading days, loyalty customers, and business insights in one installable app.

## Why This Project Exists

Small businesses often run on paper notes and memory, which makes year-end review and day-to-day decisions hard. This app provides a lightweight, practical system for:

- Logging sales quickly
- Recording days with no sales and why
- Managing loyalty/customer wallets and QR identities
- Monitoring business health from a single dashboard
- Backing up and restoring data when switching devices

## Core Features

- Owner dashboard with:
  - Today, week, and total sales summaries
  - Missed-day totals and top no-sale reason
  - Heatmap calendar (sold vs no-sale vs no entry)
  - Smart rule-based insights
  - Recent activity timeline
- Sales operations:
  - Record sale entries
  - Mark a day as no-sale with reason
  - Edit/delete logs with confirmation
  - Duplicate sale guardrails
- Loyalty and wallet management:
  - Child and adult profiles
  - Grade number input for children
  - Shared wallet support for siblings/families
  - QR generation and scanning
- Business assistant:
  - Responds to sales/trend/loyalty questions
  - Sending/loading/error/empty states
  - Fallback responses when complex queries fail
- Settings and trust features:
  - Business/currency/operating-day configuration
  - Google connection status and account linking
  - Google Drive backup and restore (appData)
  - JSON backup export/import
  - CSV exports

## Tech Stack

- HTML, CSS, Vanilla JavaScript (ES modules)
- Local persistence: `localStorage` via storage service layer
- PWA: `manifest.json` + `service-worker.js`
- Capacitor wrapper for Android packaging
- Optional Google integrations:
  - Google Identity Services (OAuth token flow)
  - Google Drive API (`drive.appdata`) for backup/restore

## Project Structure

```text
/src
  /components
  /features
    /assistant
    /dashboard
    /loyalty
    /qr
    /sales
    /settings
  /services
  /state
  /styles
  /utils
```

## Local Setup

1. Clone the repo.
2. Open `APP-Demo`.
3. Serve the app with any static server from project root:
   - `python -m http.server 8080`
   - or `npx serve .`
4. Open `http://localhost:8080`.

## PWA Install Notes

- Use HTTPS in production (required for best install + camera behavior).
- Install prompt appears when browser supports `beforeinstallprompt`.
- Offline banner appears automatically when connectivity is lost.

## Google Auth + Backup Configuration

Google features require valid OAuth configuration.

1. Create OAuth Client ID (Web application) in Google Cloud Console.
2. Add authorized JavaScript origins for your app URLs (for example your production domain).
3. Enable Google Drive API in the same project.
4. In app settings, paste the Client ID into **Google OAuth Client ID**.
5. Connect account, then use **Backup to Google** / **Restore from Google**.

If configuration is missing or invalid, the UI will show explicit errors (no false-success alerts).

## Android APK (Capacitor)

From project root:

1. `npm install`
2. `npm run cap:sync`
3. `npm run apk:debug`

Debug APK output is typically under:

- `android/app/build/outputs/apk/debug/`

## Screenshots

- `[Placeholder] Dashboard`
- `[Placeholder] Sales + No-Sale Logging`
- `[Placeholder] Loyalty + QR`
- `[Placeholder] Assistant`
- `[Placeholder] Settings + Backup`

## Portfolio Value Statement

This project demonstrates turning a demo into a production-style small-business product by combining practical UX, mobile-first PWA behavior, modular frontend architecture, offline resilience, and honest integration flows for authentication and backup.
