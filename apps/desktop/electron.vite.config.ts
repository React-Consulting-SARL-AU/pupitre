import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";

const AGENT_PROBE = resolve("../agent/internal/probe/probe.sh");
const EMBEDDED_PROBE = resolve("resources/probe.sh");

/**
 * The probe the app sends is the agent's own file, copied at build time.
 *
 * A second copy maintained by hand would drift the day the agent's probe learns
 * something new, and the app would go on describing machines with last year's
 * questions.
 */
function embedProbeScript(): Plugin {
  return {
    name: "pupitre-embed-probe",
    buildStart() {
      mkdirSync(dirname(EMBEDDED_PROBE), { recursive: true });
      copyFileSync(AGENT_PROBE, EMBEDDED_PROBE);
    },
  };
}

export default defineConfig({
  main: {
    // The design tokens ship as TypeScript: Electron cannot require them at
    // runtime, so they are bundled in rather than externalised.
    plugins: [
      embedProbeScript(),
      externalizeDepsPlugin({
        exclude: ["@pupitre/design", "@pupitre/shared"],
      }),
    ],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
  },
});
