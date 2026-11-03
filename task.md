# Emerald / pokemobile

iPhone 15 Pro PWA for Emerald++. The patched ROM stays off Cloudflare. German names are a small UPS applied in memory.

## Live

- GitHub: private `whybirdslie/pokemobile` on `main`
- Pages: https://pokemobile.pages.dev (Direct Upload project `pokemobile`)
- Supabase: project `pokemobile` (`wyrkmjmkxqkhzqgrwsdw`, `ap-southeast-1`, $0/month). Table `emerald_saves` with RLS. `.env` is local only

## Done

- Vite app, any-orientation home-screen manifest, service worker, touch layout
- Chrome is a hamburger menu. Portrait game sits under that bar. Landscape keeps only D-pad and A/B on the game; Select/Start/L/R/Fast/Slow sit in the bottom strip clear of the Dynamic Island
- EmulatorJS 4.2.3 mGBA, threads off, vendored under `public/data`
- Core boot needs `compression/extract7z.js`, both wasm cores, and `cores/reports/mgba.json` with `defaultWebGL2`
- Language screen: English names or German names. Menus stay English
- IndexedDB for the patched ROM and SRAM. Dev server can read the local `.gba`. Production does not
- Name patch: 689 species, 804 moves, 285 abilities, 587 items, 17 types. Trainer names stay English
- SRAM uploads while playing and when the app hides. Save states stay on the device

## Still do in the Supabase dashboard

Sign-in is email plus password inside the home screen app. The confirm link only verifies the address, because Mail opens Safari and that browser does not share the home screen login.

`jeffreycheung2000@hotmail.com` is already confirmed. A second Create account does not change the password or send mail. On 2026-11-03 the stored password was replaced in `auth.users` after the built-in mailer hit its rate limit. Sign in on the home screen with that password.

1. Authentication → URL Configuration → Site URL = `https://pokemobile.pages.dev`
2. Add Redirect URL `https://pokemobile.pages.dev/**`
3. Keep Confirm email on. No custom SMTP.

## Run

```powershell
npm install
npm run dev
npm run build
npx wrangler login
npx wrangler pages deploy dist --project-name pokemobile
```

Upload without Wrangler login (uses a short-lived Pages JWT from the Cloudflare MCP or dashboard):

```powershell
$env:CF_PAGES_UPLOAD_JWT='...'
node tools/pages-upload.mjs
```
