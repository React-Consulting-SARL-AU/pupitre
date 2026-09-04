import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { startLocaleWatch } from "./stores/locale";
import { startThemeWatch } from "./stores/theme";
import "./styles.css";

// Before the first paint: the attribute has to be on <html> or the window
// flashes the wrong theme on launch.
startThemeWatch();
startLocaleWatch();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
