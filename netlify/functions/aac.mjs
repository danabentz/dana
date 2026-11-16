import { getStore } from "@netlify/blobs";

const MAX_PLAYERS = 26;
const TICKETS_PER_PLAYER = 4;
const TEAMS = ["banditos", "wolves"];
const CAP_GAMES = ["flyers", "flames", "kraken"];
const GAME_CAPS = { flyers: 40, flames: 30, kraken: 30 };
const GAME_NAMES = {
  flyers: "Feb 18 · Stars vs Flyers",
  flames: "Mar 30 · Stars vs Flames",
  kraken: "Apr 5 · Stars vs Kraken",
};
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

const emptyTickets = () => ({ flyers: 0, flames: 0, kraken: 0 });

const sumTickets = (tickets) => CAP_GAMES.reduce((sum, game) => sum + tickets[game], 0);

// A saved `tickets` object is the source of truth. Older sign-ups only have
// `game`, and those count as all 4 tickets on that game. "Any" holds nothing.
function allocationOf(player) {
  const tickets = emptyTickets();
  if (player?.tickets && typeof player.tickets === "object") {
    for (const game of CAP_GAMES) {
      const n = Number(player.tickets[game]);
      tickets[game] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    return tickets;
  }
  if (CAP_GAMES.includes(player?.game)) tickets[player.game] = TICKETS_PER_PLAYER;
  return tickets;
}

function seatsUsed(players, exceptId) {
  const used = emptyTickets();
  for (const player of players) {
    if (player.id === exceptId) continue;
    const tickets = allocationOf(player);
    for (const game of CAP_GAMES) used[game] += tickets[game];
  }
  return used;
}

function gameStatus(players) {
  const used = seatsUsed(players);
  return CAP_GAMES.map((id) => ({
    id,
    name: GAME_NAMES[id],
    cap: GAME_CAPS[id],
    used: used[id],
    remaining: GAME_CAPS[id] - used[id],
  }));
}

function parseTickets(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Assign all 4 tickets. You can split them across games." };
  }
  const tickets = emptyTickets();
  for (const key of Object.keys(raw)) {
    if (!CAP_GAMES.includes(key)) {
      return { error: "Please pick a Stars game." };
    }
  }
  for (const game of CAP_GAMES) {
    if (raw[game] == null || raw[game] === "") continue;
    const n = Number(raw[game]);
    if (!Number.isInteger(n) || n < 0) {
      return { error: "Ticket counts have to be whole numbers." };
    }
    tickets[game] = n;
  }
  return { tickets };
}

// Exactly 4 tickets, split however they like, or none yet ("later" / "any").
function resolveChoice(body) {
  if (body.tickets !== undefined && body.tickets !== null) {
    const parsed = parseTickets(body.tickets);
    if (parsed.error) return parsed;
    const sum = sumTickets(parsed.tickets);
    if (sum === 0) {
      const game = clean(body.game, 20).toLowerCase();
      if (game === "any") return { game: "any", tickets: emptyTickets() };
      return { game: "", tickets: emptyTickets() };
    }
    if (sum !== TICKETS_PER_PLAYER) {
      return {
        error: `Assign all ${TICKETS_PER_PLAYER} tickets. You can put them on one game or split them.`,
      };
    }
    const chosen = CAP_GAMES.filter((game) => parsed.tickets[game] > 0);
    return {
      game: chosen.length === 1 ? chosen[0] : "split",
      tickets: parsed.tickets,
    };
  }

  if (body.game !== undefined) {
    const game = clean(body.game, 20).toLowerCase();
    if (!game || game === "later") return { game: "", tickets: emptyTickets() };
    if (game === "any") return { game: "any", tickets: emptyTickets() };
    if (!CAP_GAMES.includes(game)) return { error: "Please pick a Stars game." };
    return { game, tickets: { ...emptyTickets(), [game]: TICKETS_PER_PLAYER } };
  }

  return { missing: true };
}

// Someone can keep tickets they already hold on a full game, but cannot take more
// once the section is at (or over) its cap. Splits use whatever seats are left.
function capError(tickets, players, exceptId, previous) {
  const used = seatsUsed(players, exceptId);
  for (const game of CAP_GAMES) {
    const requested = tickets[game];
    const held = previous?.[game] || 0;
    const room = GAME_CAPS[game] - used[game];
    const allowed = Math.max(held, room);
    if (requested <= allowed) continue;
    const left = Math.max(0, room);
    const name = GAME_NAMES[game];
    if (left === 0) return `${name} is full.`;
    return `${name} only has ${left} seat${left === 1 ? "" : "s"} left.`;
  }
  return "";
}

function applyChoice(player, choice) {
  player.game = choice.game;
  player.tickets = choice.tickets;
  if (choice.game) player.gamePickedAt = new Date().toISOString();
  else delete player.gamePickedAt;
}

const readBody = async (req) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

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
    .filter((player) => player?.id && player?.name)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

const publicView = (player) => ({
  id: player.id,
  name: player.name,
  team: player.team,
  game: player.game || "",
  tickets: allocationOf(player),
});

const rosterPayload = (players, { admin = false } = {}) => ({
  players: admin ? players.map((player) => ({ ...player, tickets: allocationOf(player) })) : players.map(publicView),
  maxPlayers: MAX_PLAYERS,
  ticketsPerPlayer: TICKETS_PER_PLAYER,
  games: gameStatus(players),
});

export default async (req, context) => {
  const storeName =
    context?.deploy?.context === "production" ? "aac-signups" : "aac-signups-preview";
  const store = getStore({ name: storeName, consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const players = await loadPlayers(store);
    if (url.searchParams.has("admin")) {
      if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);
      return json(rosterPayload(players, { admin: true }));
    }
    return json(rosterPayload(players));
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body) return json({ error: "Invalid request." }, 400);

    const name = clean(body.name, 60);
    const contact = clean(body.contact, 100);
    const team = clean(body.team, 20).toLowerCase();

    if (!name) return json({ error: "Please enter your name." }, 400);
    if (contact && !isContact(contact))
      return json({ error: "Please enter a valid email or phone number." }, 400);
    if (!TEAMS.includes(team)) return json({ error: "Please pick a team." }, 400);

    const choice = resolveChoice(body);
    if (choice.missing) {
      return json({ error: "Pick a Stars game, or choose “I'll pick later”." }, 400);
    }
    if (choice.error) return json({ error: choice.error }, 400);

    const players = await loadPlayers(store);
    if (players.length >= MAX_PLAYERS)
      return json({ error: "Sorry, the roster is full." }, 409);
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return json({ error: `${name} is already signed up.` }, 409);

    const full = capError(choice.tickets, players);
    if (full) return json({ error: full }, 409);

    const createdAt = new Date().toISOString();
    const id = `${createdAt}-${crypto.randomUUID().slice(0, 8)}`;
    const player = { id, name, contact, team, createdAt };
    applyChoice(player, choice);
    await store.setJSON(id, player);
    return json({ player: publicView(player), games: gameStatus([...players, player]) }, 201);
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    if (!body) return json({ error: "Invalid request." }, 400);

    const id = clean(body.id, 80);
    const player = id ? await store.get(id, { type: "json" }) : null;
    if (!player?.id || !player?.name) return json({ error: "We couldn't find that player." }, 404);

    const updated = { ...player };
    let changed = false;

    if (body.name !== undefined) {
      const name = clean(body.name, 60);
      if (!name) return json({ error: "Please enter your name." }, 400);
      const players = await loadPlayers(store);
      if (
        players.some(
          (p) => p.id !== player.id && p.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        return json({ error: `${name} is already signed up.` }, 409);
      }
      updated.name = name;
      changed = true;
    }

    // Contact is only written on a profile edit (which always includes a name).
    // Picking a game does not require, or change, contact info.
    if (body.name !== undefined && clean(body.contact, 100)) {
      const contact = clean(body.contact, 100);
      if (!isContact(contact))
        return json({ error: "Please enter a valid email or phone number." }, 400);
      updated.contact = contact;
      changed = true;
    }

    if (body.tickets !== undefined || body.game !== undefined) {
      const choice = resolveChoice(body);
      if (choice.missing) return json({ error: "Nothing to update." }, 400);
      if (choice.error) return json({ error: choice.error }, 400);
      const players = await loadPlayers(store);
      const full = capError(choice.tickets, players, player.id, allocationOf(player));
      if (full) return json({ error: full }, 409);
      applyChoice(updated, choice);
      changed = true;
    }

    if (!changed) return json({ error: "Nothing to update." }, 400);

    await store.setJSON(id, updated);
    const players = await loadPlayers(store);
    return json({ player: publicView(updated), games: gameStatus(players) });
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
