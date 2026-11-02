import { getStore } from "@netlify/blobs";

const MAX_PLAYERS = 26;
const TEAMS = ["banditos", "wolves"];
const GAMES = ["flyers", "flames", "kraken"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clean = (value, max) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const isContact = (value) =>
  EMAIL_RE.test(value) || value.replace(/\D/g, "").length >= 10;

const isAdmin = (req) => {
  const key = process.env.AAC_ADMIN_KEY;
  return Boolean(key) && req.headers.get("x-admin-key") === key;
};

async function loadPlayers(store) {
  const { blobs } = await store.list();
  const players = await Promise.all(
    blobs.map(({ key }) => store.get(key, { type: "json" }))
  );
  return players
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const publicView = ({ id, name, team, game }) => ({ id, name, team, game });

export default async (req, context) => {
  const storeName =
    context?.deploy?.context === "production" ? "aac-signups" : "aac-signups-preview";
  const store = getStore({ name: storeName, consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const players = await loadPlayers(store);
    if (url.searchParams.has("admin")) {
      if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);
      return json({ players, maxPlayers: MAX_PLAYERS });
    }
    return json({ players: players.map(publicView), maxPlayers: MAX_PLAYERS });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    const name = clean(body.name, 60);
    const contact = clean(body.contact, 100);
    const team = clean(body.team, 20).toLowerCase();
    const game = clean(body.game, 20).toLowerCase();

    if (!name) return json({ error: "Please enter your name." }, 400);
    if (!isContact(contact))
      return json({ error: "Please enter a valid email or phone number." }, 400);
    if (!TEAMS.includes(team)) return json({ error: "Please pick a team." }, 400);
    if (!GAMES.includes(game))
      return json({ error: "Please pick a Stars game." }, 400);

    const players = await loadPlayers(store);
    if (players.length >= MAX_PLAYERS)
      return json({ error: "Sorry, the roster is full." }, 409);
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return json({ error: `${name} is already signed up.` }, 409);

    const createdAt = new Date().toISOString();
    const id = `${createdAt}-${crypto.randomUUID().slice(0, 8)}`;
    const player = { id, name, contact, team, game, createdAt };
    await store.setJSON(id, player);
    return json({ player: publicView(player) }, 201);
  }

  if (req.method === "DELETE") {
    if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing id." }, 400);
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/aac" };
