import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./routes/HomePage";
import NewSessionPage from "./routes/NewSessionPage";
import OverlayPage from "./routes/OverlayPage";

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/new" element={<NewSessionPage />} />
      <Route path="/overlay/:sessionId" element={<OverlayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
