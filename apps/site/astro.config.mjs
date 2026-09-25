import mdx from "@astrojs/mdx"
import sitemap from "@astrojs/sitemap"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import { legalGuard } from "./scripts/legal"
import { notFoundPages } from "./scripts/not-found"

export default defineConfig({
  site: PUPITRE_ORIGINS.site,
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
    notFoundPages(),
  ],
  markdown: {
    syntaxHighlight: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
