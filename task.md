# Emerald

iPhone 15 Pro PWA for Emerald++. The patched ROM stays off Cloudflare. German names are a small UPS applied in memory.

## Done

- Vite app, landscape home-screen manifest, service worker, touch layout
- EmulatorJS 4.2.3 mGBA, threads off, vendored under `public/data`
- Core boot needs `compression/extract7z.js`, both wasm cores, and `cores/reports/mgba.json` with `defaultWebGL2`. Without the report it asks for the legacy core. The 7z unpacker was the runtime error
- Language screen hides once play starts. The emulator Start Game overlay is removed. On a touch screen the GBA pad is shown. Names reloads so a second core is not stacked
- Checked in the browser: German names boot into the intro. The loaded 32MB image has Bisasam in the species table and still has FIGHT. `dist/` has the name UPS only, no `.gba`
- Language screen: English names or German names. Menus stay English
- IndexedDB for the patched ROM and SRAM. Dev server can read the local `.gba`. Production does not
- Name patch: 689 species, 804 moves, 285 abilities, 587 items, 17 types. 45 names clipped to the field width. See `tools/cache/name-report.json`
- Trainer names are not in a fixed table in this ROM, so they stay English
- Supabase email code login and SRAM sync code, plus `supabase/emerald_saves.sql`
- SRAM uploads while playing and when the app hides. Save states stay on the device

## Not done

- Supabase project is not created. A new project in the existing org is $0/month. Needs a yes before it is created
- Auth email template must include `{{ .Token }}` so the 6 digit code is in the mail
- Phone still needs the patched ROM copied in once. The site will not send it
- Rebuild after `.env` exists. Vite inlines `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time, so a build without them ships with cloud saves off

## Run

```powershell
npm install
npm run dev
npm run build
npx wrangler pages deploy dist --project-name emerald
```
