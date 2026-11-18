# Emerald / pokemobile

iPhone 15 Pro PWA for Emerald++. The patched ROM stays off Cloudflare. German names are a small UPS applied in memory.

## Live

- GitHub: private `whybirdslie/pokemobile` on `main`
- Pages: https://pokemobile.pages.dev (Direct Upload project `pokemobile`). Live deploy `dafc647a`, service worker `emerald-v23`. A saved language boots straight into the game. A full close can reopen offline after one online open. iPad keeps the on-screen pad, including with a Magic Keyboard. Arrows move, Z is A, X is B, Enter is Start, V is Select, Q is L, E is R.
- Saves: https://pokemobile-saves.jeffreycheung2000.workers.dev KV `pokemobile-saves` (`571c5632799646fe966680fef26f7a1b`). Supabase is unused

## Done

- Vite app, any-orientation home-screen manifest, service worker, touch layout
- Chrome is a hamburger menu. Speed is 1.5x, 2x, and 3x buttons. The lit button is green. Pressing it again turns speed off. The fast-forward turn-on call has to keep the emulator as this, or the click looks dead. The drag slider is gone because the core only keeps a ratio when fast-forward is turned off, the ratio is set, then fast-forward is turned on, and a drag fires that too many times. An iPad keeps the same on-screen pad, including with a Magic Keyboard. The core treats that iPad as a desktop and leaves the pad disabled, so a touch screen forces it back on. The trackpad does not lock the mouse or open the emulator menu. Keys use the core map: arrows move, Z is A, X is B, Enter is Start, V is Select, Q is L, E is R. A desktop with no touch still does not get a fake touch start. The left half is a floating stick: the thumb-down point is the origin, and a drag snaps to up, down, left, or right. A real diagonal holds two of those. L and Select sit above that zone. Start and R sit above A and B, shifted right so the gap matches Select. R is the same distance from Start as Select is from L. A sits a little left and a little higher. B stays where it was. Button height and horizontal size sit in Layout, which stays closed until opened. Layout also chooses Drag or D-pad. Drag is the default floating stick. D-pad is the cross. Button height is both orientations, default 150. Portrait picture matches the phone width. Horizontal size is landscape only, default 92%, saved on the phone. The hamburger and the phrase box scroll when the phone is horizontal.
- HM01 through HM08 are taught with the same function as TMs, but the keep-item check stopped at TM100, so using Cut deleted it. The in-memory ROM raises that cutoff through HM08. An item already removed stays gone.
- Forever Candy is a key item whose field script is the Rare Candy one. Using it with Select on the map can black-screen inside the hack. The bag is the safe way to use it. Face buttons are forced up once the finger is gone so Select cannot stay held.
- EmulatorJS 4.2.3 mGBA, threads off, vendored under `public/data`
- Core boot needs `compression/extract7z.js`, both wasm cores, and `cores/reports/mgba.json` with `defaultWebGL2`
- Language screen only the first time. After that the saved language boots straight into the game. Sound starts on the first tap. Names in the menu switches language and reloads. The phrase sync does not hold the boot. A full close reopens from the cached app script, emulator, and the ROM already on the phone.
- IndexedDB for the patched ROM and SRAM. Dev server can read the local `.gba`. Production does not
- Name patch: 689 species, 804 moves, 285 abilities, 587 items, 17 types. Trainer names stay English
- SRAM uploads while playing and when the app hides. A playing upload waits at least 2 minutes, and it does not download the cloud file first. Closing the app still uploads immediately. The save on this phone is the master. A restart never replaces it with an older cloud copy. The phrase only fills a phone that has no save yet. Save states stay on the device. The KV free tier is shared by the whole Cloudflare account: 1,000 writes and 100,000 reads a day. The old sync did a read and a write whenever the save bytes changed, as often as every 15 seconds.

## Still do in the Supabase dashboard

No account. The game opens on the language screen. Cloud save is a phrase of real words, for example Amber River Lily. This phone's save is uploaded to that phrase. Another phone loads it only when that phone has no save yet. Worker `pokemobile-saves` stores the file in KV namespace `pokemobile-saves`. R2 was not enabled on the account. Supabase is not used.

## Working notes

- Do not start the local Vite server when editing. Check the phone against Pages after a deploy.
- German species names are in the ROM table (Mudkip is Hydropi, Marshtomp is Moorabbel, Swampert is Sumpex). The save stores the name on the Pokémon. Evolution does not rewrite it, so a Hydropi that evolved stays Hydropi until it is renamed from the party menu.

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
