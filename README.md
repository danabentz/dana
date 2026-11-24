# dana
Dana's about me page

## Previewing Klevi's birthday takeover

1. From the repository root, start a local web server: `python3 -m http.server 8000`.
2. Open `http://localhost:8000/klevi.html?mode=birthday` in a browser to force the birthday experience.
3. Visit the page without the `mode=birthday` query string to see the regular voyage UI.

## AAC game sign-up (`/aac`)

Sign-ups are saved by the `netlify/functions/aac.mjs` function in Netlify Blobs (no database setup needed). Deploy previews use a separate store from production.

- Email or phone is optional at sign-up. Anyone on the roster can add or change their name, email, or phone, and can pick or change a Stars game, without re-entering contact info. Contact info is never shown on the public roster. To see it, set an `AAC_ADMIN_KEY` environment variable in Netlify (Site configuration → Environment variables), redeploy, then open `/aac?admin` and enter that key. The organizer view shows contact info, per-game counts, a CSV download, and remove buttons.
- Local testing: `npx netlify-cli dev --dir .` from the repository root.

## AAC waiver (`/aac-waiver`)

Archived after the November 23, 2026 game (Wolvitos vs Zeros, tie). The page and `/api/aac-waiver` no longer accept signatures. The form, PDF template, and function stay in the repo for next year. Signed PDFs already saved in Netlify Blobs are still available at `/aac-waiver?admin` with `AAC_ADMIN_KEY`.

To collect waivers again, set `data-waiver="open"` on `<body>` in `aac-waiver.html`, set `ACCEPTING_SIGNATURES` to `true` in `netlify/functions/aac-waiver.mjs`, and add the sign-up link back on `aac.html`.

When it is open, players read the Dallas Stars release and sign it on the page (draw or type). The signed PDF is saved in Netlify Blobs, separate from the roster.

Emailing a copy to the player and to `danabentzpdx@gmail.com` needs [Resend](https://resend.com):

- `RESEND_API_KEY` — API key from Resend.
- `WAIVER_FROM` — `Dana Bentz <d@danabentz.com>` after `danabentz.com` is verified in Resend. Until then, Resend only delivers from `onboarding@resend.dev`, and only to the Resend account email.
- `WAIVER_TO` — optional. Defaults to `danabentzpdx@gmail.com`.
