# dana
Dana's about me page

## Previewing Klevi's birthday takeover

1. From the repository root, start a local web server: `python3 -m http.server 8000`.
2. Open `http://localhost:8000/klevi.html?mode=birthday` in a browser to force the birthday experience.
3. Visit the page without the `mode=birthday` query string to see the regular voyage UI.

## AAC game sign-up (`/aac`)

Sign-ups are saved by the `netlify/functions/aac.mjs` function in Netlify Blobs (no database setup needed). Deploy previews use a separate store from production.

- Contact info is never shown publicly. To see it, set an `AAC_ADMIN_KEY` environment variable in Netlify (Site configuration → Environment variables), redeploy, then open `/aac?admin` and enter that key. The organizer view shows contact info, per-game counts, a CSV download, and remove buttons.
- Local testing: `npx netlify-cli dev --dir .` from the repository root.
