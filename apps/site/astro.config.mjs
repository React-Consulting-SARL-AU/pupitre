import mdx from "@astrojs/mdx"
import sitemap from "@astrojs/sitemap"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import { legalGuard } from "./scripts/legal"

export default defineConfig({
  site: "https://pupitre.studio",
  output: "static",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr"],
  },
  integrations: [
    legalGuard(),
    mdx(),
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", fr: "fr" } },
      filter: (page) => !page.includes("/404"),
    }),
  ],
  markdown: {
    syntaxHighlight: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
