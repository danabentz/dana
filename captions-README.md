# Live Captions Overlay (`/captions`)

This implementation includes:

- `captions-backend` (Render): Node.js + TypeScript WebSocket relay
- `captions-frontend` (Netlify): Vite + React + TypeScript UI and overlay

## Folder Structure

```text
captions-backend/
  src/index.ts
  package.json
  tsconfig.json

captions-frontend/
  src/
    App.tsx
    main.tsx
    config.ts
    captions.ts
    session.ts
    types.d.ts
    routes/
      HomePage.tsx
      NewSessionPage.tsx
      OverlayPage.tsx
    styles.css
  public/_redirects
  .env.example
  index.html
  package.json
  tsconfig*.json
  vite.config.ts
```

## 1) Local Development

### Backend

```bash
cd captions-backend
npm install
npm run dev
```

Backend defaults to `http://localhost:3000` and WebSocket endpoint `ws://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/health
```

### Frontend

```bash
cd captions-frontend
cp .env.example .env.local
```

Edit `.env.local`:

```bash
VITE_CAPTIONS_WS_URL="ws://localhost:3000"
```

Run:

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/captions`
- `http://localhost:5173/captions/new`
- `http://localhost:5173/captions/overlay/<sessionId>?debug=1`

## 2) Render Backend Deploy

Create a new Render Web Service from `captions-backend`.

- Runtime: Node
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/health`
- Environment Variables: none required (`PORT` is injected by Render)

After deploy, your WS URL is:

```text
wss://<your-render-service>.onrender.com
```

## 3) Netlify Frontend Deploy (`/captions`)

Use `captions-frontend` as the site root.

Build settings:

- Build command: `npm run build`
- Publish directory: `dist`

Environment variable:

- `VITE_CAPTIONS_WS_URL = wss://<your-render-service>.onrender.com`

SPA redirect is included in `captions-frontend/public/_redirects`:

```text
/captions/*  /captions/index.html  200
```

Important:

- Vite base is configured as `/captions/`
- React Router uses `basename="/captions"`

## 4) Usage Flow

1. Open `https://danabentz.com/captions`
2. Click **Start Captions** to create a session on `/captions/new`
3. Click **Start Captions** on that page (Chrome only)
4. Copy overlay URL:
   - `https://danabentz.com/captions/overlay/<sessionId>`
5. Open overlay in browser/OBS

## 5) OBS Setup

1. In OBS, add a **Browser Source**
2. URL = overlay link (`https://danabentz.com/captions/overlay/<sessionId>`)
3. Width = `1920`, Height = `1080`
4. Optionally disable "Refresh cache of current page when scene becomes active"
5. Ensure your scene/background supports transparency

Overlay query params:

- `fontSize` (default `64`)
- `maxLines` (default `2`)
- `align` (default `center`, options: `left|center|right`)
- `debug=1` shows placeholder/status
