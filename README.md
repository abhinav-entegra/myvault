# Myvault

Offline-first password manager (Electron desktop app + Chrome extension for autofill). Repo: [abhinav-entegra/myvault](https://github.com/abhinav-entegra/myvault).

## Supabase (embedded, no GitHub Secrets required)

Production credentials are **AES-256-GCM** encrypted and committed as `app/embed/supabase.embedded.cipher.json`. At runtime `app/supabase-sync.js` derives the key (`app/embed/derive-embedded-key.js`) and decrypts locally in the Electron main process. **CI/CD only checks out the repo and builds**—no Supabase secrets in GitHub Actions.

After changing plaintext settings (URLs, keys, org suffix):

1. Edit the local **`app/supabase.config.json`** (copy from `app/supabase.config.sample.json`; that file stays gitignored).
2. Run **`npm run embed:supabase`** and commit the updated `app/embed/supabase.embedded.cipher.json`.

Optional overrides (devops / testing): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_TABLE`, `SUPABASE_ORG_SUFFIX` still override embedded values when set.

> Encrypted blobs are not a substitute for server-side RLS and key rotation. Anyone with the app binary can still extract ciphertext and attempt offline analysis—treat service-role keys carefully.

## Build locally

```bash
npm ci
npm run build
npm run dist
```

Windows installer output: `dist/Myvault Setup *.exe` (name follows `productName` and version in `package.json`).

## CI / downloads

Workflow: `.github/workflows/build-windows.yml`.

- Every push to `main` (and tags `v*`): builds the Windows installer and uploads it as an **Actions artifact**.
- Pushing a **tag** like `v1.0.1` attaches `dist/*.exe` to a **GitHub Release** for a stable download URL.

## Electron auto-update (optional)

`package.json` `build.publish` points at `github:abhinav-entegra/myvault`. Advanced: use `electron-builder --publish` with a `GITHUB_TOKEN` for auto-releases.

## Browser extension

The `extension/` folder is bundled as `extraResources`. Install via Chrome **Load unpacked** and set the vault **API base URL** in extension options for LAN access.
