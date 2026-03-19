# Cathdel Creamy

Cathdel Creamy is a mobile-first, installable PWA built for a real small vendor business.  
It helps the owner track sales, missed trading days, loyalty/customer activity, QR usage, and practical business insights in one place.

## Product Value

- Record daily sales quickly
- Log no-sale days with reasons
- Track trends with dashboard insights
- Manage customers, wallets, and QR profiles
- Export business reports (CSV)
- Work offline with local persistence
- Optional Google backup and AI assistant integrations

## Core Features

- Owner dashboard with summary cards, trends, heatmap, and recent activity
- Sales and no-sale logging with validation
- Reason analytics for missed trading days
- Loyalty/customer management (child + adult profiles)
- Shared wallet behavior for siblings/families
- QR generation and scanning tools with reset/clear controls
- Assistant with expanded business-question coverage
- Settings for business rules, operating days, backup, and integrations
- Export and backup tooling with truthful success/error messaging

## Tech Stack

- Vanilla JS modules (`src/`)
- CSS design tokens + component styles
- LocalStorage state layer with sanitization/migration
- Service worker + manifest for PWA install/offline behavior
- Capacitor Android wrapper for APK delivery
- Optional integrations:
  - Google OAuth + Drive appData backup (web flow)
  - PostHog (analytics)
  - Sentry (error monitoring)
  - Groq/OpenRouter (assistant remote intelligence)

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

## Local Setup (PWA)

1. Clone the repo.
2. Serve the project on HTTPS (recommended) or localhost.
3. Open `index.html` through the server.
4. Install from browser menu (`Add to Home Screen`) for mobile-like usage.

## Android APK Build (Capacitor)

```bash
npm install
npm run cap:sync
npm run apk:debug
```

If local Android SDK is not configured, use the GitHub Actions release workflow to build APK automatically.

## Offline Behavior

- The APK uses bundled local web assets (not a remote URL), so core business flows work without internet.
- QR libraries are bundled locally for offline QR generation/scanning support.
- Google backup/auth and remote AI features still require internet by design.

## Google Auth and Backup Setup

Google features require configuration and environment support.

1. Create a Google OAuth Client ID (Web Application) in Google Cloud.
2. Add your deployed app origin to **Authorized JavaScript origins**.
3. Enable Google Drive API.
4. In app Settings:
   - set **Google OAuth Client ID**
   - save settings
   - then connect Google

### Important APK Note

The current APK wrapper uses a web popup OAuth flow. In many APK WebView contexts, Google popup OAuth is unsupported.  
In that case, the app now shows an honest unsupported message instead of false success.

## Optional Observability Setup

- Add PostHog project key/host in Settings to enable event tracking.
- Add Sentry DSN in Settings to enable error monitoring.
- App remains fully functional if these are not configured.

## Screenshots

- `screenshots/dashboard.png` (placeholder)
- `screenshots/sales.png` (placeholder)
- `screenshots/loyalty-qr.png` (placeholder)
- `screenshots/settings.png` (placeholder)

## Why This Project

Cathdel Creamy demonstrates a practical startup-style MVP: clean frontend architecture, mobile-first UX, offline resilience, and trustworthy business workflows suitable for real small-business operations.
