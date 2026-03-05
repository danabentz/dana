import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { splitIntoCaptionLines } from "../captions";
import { CAPTIONS_WS_URL } from "../config";
import { createSessionId } from "../session";

type LangOption = "en-US" | "es-ES" | "fr-FR" | "de-DE";

const LANGUAGE_OPTIONS: Array<{ value: LangOption; label: string }> = [
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" }
];

type SpeechCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechCtor | null {
  const win = window as Window & {
    webkitSpeechRecognition?: SpeechCtor;
    SpeechRecognition?: SpeechCtor;
  };

  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function isLikelyChrome(): boolean {
  const ua = navigator.userAgent;
  return /Chrome/.test(ua) && !/Edg|OPR/.test(ua);
}

type PublishPayload = {
  type: "publish";
  sessionId: string;
  lines: string[];
  ts: number;
};

export default function NewSessionPage(): JSX.Element {
  const sessionId = useMemo(() => createSessionId(12), []);
  const [language, setLanguage] = useState<LangOption>("en-US");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState("");
  const [wsState, setWsState] = useState("Connecting...");
  const [previewLines, setPreviewLines] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldRunRef = useRef(false);
  const finalTextRef = useRef("");
  const pendingPayloadRef = useRef<PublishPayload | null>(null);

  const overlayUrl = `${window.location.origin}/captions/overlay/${sessionId}`;

  useEffect(() => {
    const ws = new WebSocket(CAPTIONS_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setWsState("Connected");
    ws.onclose = () => setWsState("Disconnected");
    ws.onerror = () => setWsState("Error");

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const ws = wsRef.current;
      const payload = pendingPayloadRef.current;

      if (!ws || ws.readyState !== WebSocket.OPEN || !payload) {
        return;
      }

      ws.send(JSON.stringify(payload));
      pendingPayloadRef.current = null;
    }, 100);

    return () => window.clearInterval(timer);
  }, []);

  function queuePublish(lines: string[]): void {
    pendingPayloadRef.current = {
      type: "publish",
      sessionId,
      lines,
      ts: Date.now()
    };
  }

  function updatePreview(text: string): void {
    const lines = splitIntoCaptionLines(text, 2, 42);
    setPreviewLines(lines);
    queuePublish(lines);
  }

  function stopRecognition(): void {
    shouldRunRef.current = false;
    setRunning(false);
    setStatus("Stopped");
    recognitionRef.current?.stop();
    queuePublish([]);
  }

  function startRecognition(): void {
    setError("");

    if (!isLikelyChrome()) {
      setError("This tool currently supports Chrome only.");
      return;
    }

    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      setError("SpeechRecognition is not supported in this browser.");
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setStatus("Listening...");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const text = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) {
            finalChunk += `${text} `;
          } else {
            interim += text;
          }
        }

        if (finalChunk) {
          finalTextRef.current = `${finalTextRef.current} ${finalChunk}`.trim();
        }

        const merged = `${finalTextRef.current} ${interim}`.trim();
        updatePreview(merged);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setError("Microphone permission denied. Please allow mic access in Chrome.");
          shouldRunRef.current = false;
          setRunning(false);
          return;
        }

        if (event.error === "audio-capture") {
          setError("No microphone detected. Check your audio input.");
          return;
        }

        setError(`Speech recognition error: ${event.error}`);
      };

      recognition.onend = () => {
        setStatus("Stopped");
        if (shouldRunRef.current) {
          setTimeout(() => {
            recognition.start();
          }, 250);
        }
      };

      recognitionRef.current = recognition;
    }

    recognitionRef.current.lang = language;
    shouldRunRef.current = true;
    setRunning(true);
    setStatus("Starting...");
    recognitionRef.current.start();
  }

  useEffect(() => {
    if (running && recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language, running]);

  useEffect(() => {
    return () => {
      shouldRunRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  async function copyOverlayUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setStatus("Overlay URL copied");
    } catch {
      setError("Could not copy. Copy the URL manually.");
    }
  }

  return (
    <main className="page-shell">
      <div className="panel wide">
        <div className="row spread">
          <h1>New Captions Session</h1>
          <Link className="link" to="/">
            Back
          </Link>
        </div>

        <p className="muted">
          Session ID: <code>{sessionId}</code>
        </p>

        <div className="row">
          <button className="btn" onClick={running ? stopRecognition : startRecognition} type="button">
            {running ? "Stop" : "Start"} Captions
          </button>

          <label className="label">
            Language
            <select className="select" value={language} onChange={(e) => setLanguage(e.target.value as LangOption)}>
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="muted">Recognition: {status}</p>
        <p className="muted">WebSocket: {wsState}</p>
        {error ? <p className="error">{error}</p> : null}

        <div className="overlay-link">
          <span className="muted">Overlay URL</span>
          <code>{overlayUrl}</code>
          <button className="btn btn-secondary" onClick={copyOverlayUrl} type="button">
            Copy
          </button>
        </div>

        <div className="preview">
          {previewLines.length > 0 ? (
            previewLines.map((line) => <div key={line}>{line}</div>)
          ) : (
            <span className="muted">Transcript preview will appear here.</span>
          )}
        </div>
      </div>
    </main>
  );
}
