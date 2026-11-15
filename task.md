# Emerald / pokemobile

iPhone 15 Pro PWA for Emerald++. The patched ROM stays off Cloudflare. German names are a small UPS applied in memory.

## Live

- GitHub: private `whybirdslie/pokemobile` on `main`
- Pages: https://pokemobile.pages.dev (Direct Upload project `pokemobile`)
- Saves: https://pokemobile-saves.jeffreycheung2000.workers.dev KV `pokemobile-saves` (`571c5632799646fe966680fef26f7a1b`). Supabase is unused

## Done

- Vite app, any-orientation home-screen manifest, service worker, touch layout
- Chrome is a hamburger menu. Fast and Slow toggle off when tapped again. L and Select sit above the D-pad. Start and R sit above A and B. Portrait picture matches the phone width. Landscape size is a slider in the menu, default 92%, saved on the phone.
- EmulatorJS 4.2.3 mGBA, threads off, vendored under `public/data`
- Core boot needs `compression/extract7z.js`, both wasm cores, and `cores/reports/mgba.json` with `defaultWebGL2`
- Language screen: English names or German names. Menus stay English
- IndexedDB for the patched ROM and SRAM. Dev server can read the local `.gba`. Production does not
- Name patch: 689 species, 804 moves, 285 abilities, 587 items, 17 types. Trainer names stay English
- SRAM uploads while playing and when the app hides. Save states stay on the device

## Still do in the Supabase dashboard

No account. The game opens on the language screen. Cloud save is a phrase of real words, for example Amber River Lily. The same words on another phone pull that SRAM. The phrase is the key. Worker `pokemobile-saves` stores the file in KV namespace `pokemobile-saves`. R2 was not enabled on the account. Supabase is not used.

## Working notes

- Do not start the local Vite server when editing. Check the phone against Pages after a deploy.

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
