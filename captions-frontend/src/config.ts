const fallbackUrl = "ws://localhost:3000";

export const CAPTIONS_WS_URL = (import.meta.env.VITE_CAPTIONS_WS_URL as string | undefined) || fallbackUrl;
