import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

type PublishMessage = {
  type: "publish";
  sessionId: string;
  lines: string[];
  ts: number;
};

type SubscribeMessage = {
  type: "subscribe";
  sessionId: string;
};

type ClientMessage = PublishMessage | SubscribeMessage;

type SessionPayload = {
  lines: string[];
  ts: number;
};

const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGES_PER_SECOND = 40;
const MAX_LINE_LENGTH = 240;
const MAX_LINES = 4;
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{10,16}$/;

const latestBySession = new Map<string, SessionPayload>();
const subscribersBySession = new Map<string, Set<WebSocket>>();
const subscriptionsBySocket = new Map<WebSocket, Set<string>>();
const messageCountBySocket = new Map<WebSocket, { windowStart: number; count: number }>();

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

const wss = new WebSocketServer({ server });

function safeSend(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function isSocketFlooding(socket: WebSocket): boolean {
  const now = Date.now();
  const existing = messageCountBySocket.get(socket);

  if (!existing || now - existing.windowStart >= 1000) {
    messageCountBySocket.set(socket, { windowStart: now, count: 1 });
    return false;
  }

  existing.count += 1;
  if (existing.count > MAX_MESSAGES_PER_SECOND) {
    return true;
  }
  return false;
}

function cleanupSocket(socket: WebSocket): void {
  messageCountBySocket.delete(socket);

  const subscribedSessions = subscriptionsBySocket.get(socket);
  if (!subscribedSessions) {
    return;
  }

  for (const sessionId of subscribedSessions) {
    const subscribers = subscribersBySession.get(sessionId);
    if (!subscribers) {
      continue;
    }

    subscribers.delete(socket);
    if (subscribers.size === 0) {
      subscribersBySession.delete(sessionId);
    }
  }

  subscriptionsBySocket.delete(socket);
}

function subscribeSocketToSession(socket: WebSocket, sessionId: string): void {
  let socketSessions = subscriptionsBySocket.get(socket);
  if (!socketSessions) {
    socketSessions = new Set<string>();
    subscriptionsBySocket.set(socket, socketSessions);
  }
  socketSessions.add(sessionId);

  let subscribers = subscribersBySession.get(sessionId);
  if (!subscribers) {
    subscribers = new Set<WebSocket>();
    subscribersBySession.set(sessionId, subscribers);
  }
  subscribers.add(socket);

  const latest = latestBySession.get(sessionId);
  if (latest) {
    safeSend(socket, {
      type: "caption",
      sessionId,
      lines: latest.lines,
      ts: latest.ts
    });
  }
}

function publishToSession(sessionId: string, lines: string[], ts: number): void {
  const sanitized = lines
    .slice(0, MAX_LINES)
    .map((line) => line.trim().slice(0, MAX_LINE_LENGTH))
    .filter((line) => line.length > 0);

  const payload = {
    type: "caption",
    sessionId,
    lines: sanitized,
    ts
  };

  latestBySession.set(sessionId, { lines: sanitized, ts });

  const subscribers = subscribersBySession.get(sessionId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const subscriber of subscribers) {
    safeSend(subscriber, payload);
  }
}

wss.on("connection", (socket) => {
  (socket as WebSocket & { isAlive?: boolean }).isAlive = true;

  socket.on("pong", () => {
    (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
  });

  socket.on("message", (raw) => {
    if (isSocketFlooding(socket)) {
      return;
    }

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      safeSend(socket, { type: "error", message: "Invalid JSON." });
      return;
    }

    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      safeSend(socket, { type: "error", message: "Invalid message shape." });
      return;
    }

    if (parsed.type === "subscribe") {
      if (!SESSION_ID_REGEX.test(parsed.sessionId)) {
        safeSend(socket, { type: "error", message: "Invalid sessionId." });
        return;
      }
      subscribeSocketToSession(socket, parsed.sessionId);
      return;
    }

    if (parsed.type === "publish") {
      if (!SESSION_ID_REGEX.test(parsed.sessionId)) {
        safeSend(socket, { type: "error", message: "Invalid sessionId." });
        return;
      }
      if (!Array.isArray(parsed.lines) || typeof parsed.ts !== "number") {
        safeSend(socket, { type: "error", message: "Invalid publish payload." });
        return;
      }
      publishToSession(parsed.sessionId, parsed.lines, parsed.ts);
      return;
    }

    safeSend(socket, { type: "error", message: "Unknown message type." });
  });

  socket.on("close", () => {
    cleanupSocket(socket);
  });

  socket.on("error", () => {
    cleanupSocket(socket);
  });
});

const heartbeatInterval = setInterval(() => {
  for (const socket of wss.clients) {
    const ws = socket as WebSocket & { isAlive?: boolean };
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

server.listen(PORT, () => {
  console.log(`Captions relay listening on :${PORT}`);
});
