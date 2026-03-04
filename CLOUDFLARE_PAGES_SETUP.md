# Cloudflare Pages Setup (No GitHub)

This app is ready to host on Cloudflare Pages as a static PWA.

## Option A: Direct Upload (fastest)

1. Log in to Cloudflare Dashboard.
2. Go to `Workers & Pages` -> `Create` -> `Pages` -> `Upload assets`.
3. Project name: `cathel-creamy-pwa` (or any name you prefer).
4. Upload this folder (the folder that contains `index.html` at root).
5. Deploy.

## Option B: CLI deploy (repeatable)

Prerequisite: Node.js installed.

```powershell
cmd /c npx wrangler login
cmd /c npx wrangler pages project create cathel-creamy-pwa
cmd /c npx wrangler pages deploy . --project-name cathel-creamy-pwa
```

## Why `_headers` is included

- `index.html` + `service-worker.js` are set to no-store to reduce stale app-shell issues after redeploy.
- icon files are long-cache immutable for performance.

## App compatibility notes

- Existing Google Apps Script endpoint in `index.html` remains unchanged.
- No Netlify-specific runtime code is required for this app.
