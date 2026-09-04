import path from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const ROOT = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  envDir: path.resolve(ROOT, "../.."),
  envPrefix: "VITE_",
  plugins: [
    cloudflare({
      configPath: "wrangler.jsonc",
      inspectorPort: false,
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(ROOT, "src") }],
  },
})
