import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// React Flow's structural base styles (positioning, panes, handles, edges) must load
// before the app stylesheet so the token-based overrides in ./styles.css win.
import "reactflow/dist/style.css";
import "./styles.css";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
