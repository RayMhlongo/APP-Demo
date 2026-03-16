# CreamTrack Vendor

CreamTrack Vendor is a mobile-first business management PWA for small vendors (ice-cream style businesses) to track sales, missed trading days, customer loyalty, and practical business insights.

## Product Overview

This project is designed as a realistic startup MVP:

- Premium-feeling mobile UX
- Installable PWA with offline-first behavior
- Rule-based intelligence that explains business performance
- Exportable reports for operational and month-end review
- Optional observability and AI integrations with graceful fallback

## Recruiter-Impressive Features Added

1. Smart insights engine:
- strongest/weakest sales day
- top no-sale reason
- sales streaks
- selling days this month
- week-over-week and month-over-month changes
- average daily and average weekly sales

2. Strong data architecture:
- centralized storage/sanitization layer
- explicit model definitions (`src/services/models.js`)
- centralized validation (`src/services/validation.js`)
- predictable store updates (`src/state/store.js`)

3. Report Studio:
- date-range report generation
- filtered sales CSV
- filtered no-sale CSV
- summary CSV
- print-friendly report view

4. Offline-first reliability:
- clear online/offline indicator
- local-write awareness while offline
- honest messaging (no fake cloud sync states)
- PWA shell caching and resilient loading

5. Product observability:
- optional PostHog tracking
- optional Sentry error monitoring
- safe no-config fallback (app still works fully)

## Core Product Capabilities

- Daily sale logging with edit/delete protection
- No-sale day logging with reason and notes
- Loyalty/customer management (child and adult profiles)
- Shared wallet support for siblings/family spending
- QR generation and scanning
- Assistant that always works locally and can optionally use external AI
- Google account linking + Drive backup/restore

## Tech Stack

- HTML, CSS, Vanilla JavaScript (ES modules)
- Local persistence: `localStorage`
- PWA: `manifest.json` + `service-worker.js`
- Capacitor Android wrapper
- Optional integrations:
  - Google Identity Services + Drive appData backup
  - PostHog (analytics/event tracking)
  - Sentry (error monitoring)
  - Groq/OpenRouter (assistant intelligence)

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
    analytics.js
    assistant-engine.js
    auth.js
    models.js
    reports.js
    storage.js
    sync.js
    telemetry.js
    validation.js
  /state
  /styles
  /utils
```

## Running Locally

1. Clone repo.
2. Open `APP-Demo`.
3. Start any static server from project root:
   - `python -m http.server 8080`
   - or `npx serve .`
4. Visit `http://localhost:8080`.

## PWA Notes

- Use HTTPS in production for best install/camera behavior.
- Install prompt appears when browser supports `beforeinstallprompt`.
- Core flows remain usable offline (local saves continue).

## Optional Integration Setup

### Google Auth + Backup

1. Create OAuth Client ID (Web app) in Google Cloud.
2. Add authorized JavaScript origins for deployed app URLs.
3. Enable Google Drive API.
4. In app Settings:
   - set **Google OAuth Client ID**
   - connect account
   - use backup/restore buttons

### PostHog (Free Tier)

1. Create PostHog project.
2. Copy project key.
3. In app Settings > Observability:
   - set **PostHog Project Key**
   - optionally set host (default: `https://app.posthog.com`)
4. Save settings.

Tracked events include:
- sale/no-sale logs
- report generation/exports
- assistant usage/failures
- Google connect/backup/restore attempts
- QR scan lifecycle
- install prompt events

### Sentry (Free Tier)

1. Create Sentry project (Browser/JavaScript).
2. Copy DSN.
3. In app Settings > Observability:
   - set **Sentry DSN**
4. Save settings.

### Assistant AI (Optional: Groq or OpenRouter)

Without API key, assistant uses reliable local insights only.

To enable AI:
1. Pick provider in Settings > Assistant Intelligence.
2. Add API key.
3. Optionally override model/base URL.
4. Save settings.

If remote AI fails, app automatically falls back to local assistant responses.

## Android APK (Capacitor)

From project root:

1. `npm install`
2. `npm run cap:sync`
3. `npm run apk:debug`

Expected output path:

- `android/app/build/outputs/apk/debug/`

## Deployment

The project is static-host friendly and works with GitHub Pages, Cloudflare Pages, Netlify, or Vercel static hosting.

## Screenshots Placeholders

- Dashboard (KPIs + trends + insights + heatmap)
- Sales + no-sale logging
- Loyalty + wallets + QR
- Assistant (local + optional AI)
- Settings + backups + observability

## Why This Matters

CreamTrack Vendor demonstrates practical startup engineering: clean architecture, mobile-first UX, offline resilience, analytics-ready product instrumentation, and real owner-facing value without expensive infrastructure.
