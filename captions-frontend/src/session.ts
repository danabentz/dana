const SESSION_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function createSessionId(length = 12): string {
  const clamped = Math.max(10, Math.min(16, length));
  const bytes = new Uint8Array(clamped);
  crypto.getRandomValues(bytes);
  let sessionId = "";

  for (let i = 0; i < clamped; i += 1) {
    sessionId += SESSION_ID_CHARS[bytes[i] % SESSION_ID_CHARS.length];
  }

  return sessionId;
}

export function isValidSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,16}$/.test(value);
}
