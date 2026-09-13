import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { LiveRegion } from "./components/ui/live-region";
import { TooltipProvider } from "./components/ui/tooltip";
import { watchTrace } from "./lib/trace";
import { startLocaleWatch } from "./stores/locale";
import { startTerminalSettings } from "./stores/terminal-settings";
import { startThemeWatch } from "./stores/theme";
import "./styles.css";

// Before the first paint: the attribute has to be on <html> or the window
// flashes the wrong theme on launch.
startThemeWatch();
startLocaleWatch();
startTerminalSettings();
watchTrace();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LiveRegion />
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </StrictMode>
  );
}
