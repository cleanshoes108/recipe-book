# Recipes

A personal recipe book that lives on your phone. Add recipes from a photo of a cookbook page, a link, or pasted text; search and filter them; scale any recipe to the number of people you're feeding; rate them and keep notes.

Plain HTML, CSS and JavaScript with no build step, so there is nothing to break and nothing to update. Recipes are stored on the device (IndexedDB). One small serverless function (`api/parse.js`) sends text, pages or photos to Claude and gets a structured recipe back.

## Deploy

1. Push this folder to a GitHub repository.
2. In Vercel, **Add New → Project**, pick the repository and deploy. No settings to change: there is no build command and no environment variables.
3. Open the Vercel URL on your iPhone in Safari, tap **Share → Add to Home Screen**. It then opens full screen like an app, works offline, and keeps its data safely.

## Reading recipes with Claude

Open **Settings** in the app and paste a Claude API key (create one at platform.claude.com). The key is stored on the device only and is sent along with each "Read recipe" request; the function never stores it. Reading a recipe costs a fraction of a cent.

## Backups

Recipes live only on the device. **Settings → Export a backup** saves one JSON file (photos included) that you can keep in iCloud Drive or send to another device, where **Import a backup** restores it. Export now and then.

## Layout of the code

```
index.html            app shell
css/app.css           all styling (type, colour, layout)
js/app.js             router and shared state
js/db.js              on-device storage; the only file to change for a shared database later
js/model.js           recipe shape, tag colour codes
js/quantities.js      scaling, rounding, metric formatting, ingredient line parsing
js/search.js          search and filtering
js/views/*.js         library, recipe, add, edit, settings screens
api/parse.js          Vercel function: URL fetch, JSON-LD extraction, Claude call
sw.js                 service worker (offline shell)
fonts/                Fraunces and Instrument Sans (OFL licensed)
dev.mjs               `node dev.mjs` runs it locally at http://localhost:3000
```

## Later

- A shared database (for example Supabase) replaces `js/db.js`; nothing else needs to know.
- Shopping lists and a standard export format can be built from the structured ingredients already stored.
