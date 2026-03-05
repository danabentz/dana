import { useNavigate } from "react-router-dom";
import { isValidSessionId } from "../session";

export default function HomePage(): JSX.Element {
  const navigate = useNavigate();

  function handleOpenOverlay(): void {
    const value = window.prompt("Enter session ID");
    if (!value) {
      return;
    }

    const sessionId = value.trim();
    if (!isValidSessionId(sessionId)) {
      window.alert("Session ID must be 10-16 URL-safe characters.");
      return;
    }

    navigate(`/overlay/${sessionId}`);
  }

  return (
    <main className="page-shell">
      <div className="panel">
        <h1>Live Captions</h1>
        <p className="muted">Chrome speech-to-text sender and transparent browser overlay.</p>
        <div className="row">
          <button className="btn" onClick={() => navigate("/new")} type="button">
            Start Captions
          </button>
          <button className="btn btn-secondary" onClick={handleOpenOverlay} type="button">
            Open Overlay
          </button>
        </div>
      </div>
    </main>
  );
}
