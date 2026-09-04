import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://pupitre.studio",
  output: "static",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr"],
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
