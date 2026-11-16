# Emerald / pokemobile

iPhone 15 Pro PWA for Emerald++. The patched ROM stays off Cloudflare. German names are a small UPS applied in memory.

## Live

- GitHub: private `whybirdslie/pokemobile` on `main`
- Pages: https://pokemobile.pages.dev (Direct Upload project `pokemobile`)
- Saves: https://pokemobile-saves.jeffreycheung2000.workers.dev KV `pokemobile-saves` (`571c5632799646fe966680fef26f7a1b`). Supabase is unused

## Done

- Vite app, any-orientation home-screen manifest, service worker, touch layout
- Chrome is a hamburger menu. Speed is a slider from normal to 3x, saved on the phone. The left half is a floating stick: the thumb-down point is the origin, and a drag snaps to up, down, left, or right. A real diagonal holds two of those. L and Select sit above that zone. Start and R sit above A and B, shifted right so the gap matches Select. A sits a little left and a little higher. B stays where it was. Button height is a slider for both orientations, default 150. Portrait picture matches the phone width. Landscape size is a slider in the menu, default 92%, saved on the phone. The hamburger and the phrase box scroll when the phone is horizontal.
- Forever Candy is a key item whose field script is the Rare Candy one. Using it with Select on the map can black-screen inside the hack. The bag is the safe way to use it. Face buttons are forced up once the finger is gone so Select cannot stay held.
- EmulatorJS 4.2.3 mGBA, threads off, vendored under `public/data`
- Core boot needs `compression/extract7z.js`, both wasm cores, and `cores/reports/mgba.json` with `defaultWebGL2`
- Language screen: English names or German names. Menus stay English
- IndexedDB for the patched ROM and SRAM. Dev server can read the local `.gba`. Production does not
- Name patch: 689 species, 804 moves, 285 abilities, 587 items, 17 types. Trainer names stay English
- SRAM uploads while playing and when the app hides. The save on this phone is the master. A restart never replaces it with an older cloud copy. The phrase only fills a phone that has no save yet. Save states stay on the device

## Still do in the Supabase dashboard

No account. The game opens on the language screen. Cloud save is a phrase of real words, for example Amber River Lily. This phone's save is uploaded to that phrase. Another phone loads it only when that phone has no save yet. Worker `pokemobile-saves` stores the file in KV namespace `pokemobile-saves`. R2 was not enabled on the account. Supabase is not used.

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
