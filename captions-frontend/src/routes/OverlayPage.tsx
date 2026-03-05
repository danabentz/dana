import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CAPTIONS_WS_URL } from "../config";
import { isValidSessionId } from "../session";

type CaptionMessage = {
  type: "caption";
  sessionId: string;
  lines: string[];
  ts: number;
};

function parseNumber(input: string | null, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const value = Number(input);
  if (Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

export default function OverlayPage(): JSX.Element {
  const { sessionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState("Connecting...");

  const fontSize = parseNumber(searchParams.get("fontSize"), 64);
  const maxLines = Math.max(1, Math.min(4, parseNumber(searchParams.get("maxLines"), 2)));
  const align = searchParams.get("align") || "center";
  const debug = searchParams.get("debug") === "1";

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
      document.body.style.margin = "";
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!isValidSessionId(sessionId)) {
      setStatus("Invalid session ID");
      return;
    }

    const ws = new WebSocket(CAPTIONS_WS_URL);

    ws.onopen = () => {
      setStatus("Connected");
      ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    };

    ws.onmessage = (event) => {
      let parsed: CaptionMessage;
      try {
        parsed = JSON.parse(event.data) as CaptionMessage;
      } catch {
        return;
      }

      if (parsed.type !== "caption" || parsed.sessionId !== sessionId || !Array.isArray(parsed.lines)) {
        return;
      }

      setLines(parsed.lines.slice(-maxLines));
    };

    ws.onerror = () => setStatus("Connection error");
    ws.onclose = () => setStatus("Disconnected");

    return () => ws.close();
  }, [maxLines, sessionId]);

  const textAlign = useMemo<"left" | "center" | "right">(() => {
    if (align === "left" || align === "right" || align === "center") {
      return align;
    }
    return "center";
  }, [align]);

  if (!isValidSessionId(sessionId)) {
    return (
      <div className="overlay-root debug" style={{ fontSize: Math.max(16, fontSize / 3) }}>
        Invalid session ID
      </div>
    );
  }

  if (lines.length === 0 && !debug) {
    return <div className="overlay-root" />;
  }

  return (
    <div className="overlay-root">
      <div className="caption-block" style={{ fontSize, textAlign }}>
        {lines.length > 0 ? lines.map((line) => <div key={line}>{line}</div>) : <div className="placeholder">Waiting for captions...</div>}
      </div>
      {debug ? <div className="overlay-status">{status}</div> : null}
    </div>
  );
}
