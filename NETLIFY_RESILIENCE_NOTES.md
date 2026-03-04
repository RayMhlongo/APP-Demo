# Netlify Resilience Notes

## Architecture audit

- Frontend: static `index.html` PWA (inline HTML/CSS/JS).
- PWA files: `manifest.json`, `service-worker.js`, icons in `icons/`.
- No server-side app code in this repo.
- Data backend dependency: Google Apps Script endpoint (`SHEETS_URL`) + Google Sheets.
- External runtime libraries: `html5-qrcode`, `qrcodejs`, `Chart.js`, Google Fonts (CDN).

## Netlify free-plan impact points

- Build minutes: not a factor here (no build step required).
- Functions: not used (no Netlify Functions in this project).
- Credits/bandwidth/request caps: still apply at account level.
- If account usage is fully paused by Netlify, hosted pages may become unavailable.

## Hardening changes applied

- Added durable service worker caching for app shell and third-party runtime libs.
- Added offline write queue (outbox) in `index.html`:
  - queues failed `addOrder`, `addCustomer`, `updateSettings`, `logReward`
  - merges queued items into local UI state immediately
  - auto-retries sync on reconnect
- Removed service-worker unregister-on-load behavior.
- Added runtime fallbacks:
  - scanner fallback if camera/scanner library unavailable
  - QR generator fallback if `QRCode` library unavailable
  - chart fallbacks if `Chart.js` unavailable
- Added deploy config:
  - `netlify.toml` (static publish config)
  - `_redirects` (`/* /index.html 200`)
  - existing `_headers` retained for cache-control.

## Deployment

- Deploy this folder root (where `index.html` is located).
- Recommended: drag-and-drop deploy or Netlify CLI direct deploy.
