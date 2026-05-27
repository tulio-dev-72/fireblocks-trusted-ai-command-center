import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AnalyticsProvider } from "./components/AnalyticsProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </StrictMode>,
);
