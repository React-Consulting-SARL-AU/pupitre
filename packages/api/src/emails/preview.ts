import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from "@pupitre/shared/i18n"
import { serve } from "bun"
import { EMAIL_PREVIEWS, previewOf } from "./catalog"
import { EMAIL_TEMPLATE_IDS, type EmailTemplateId } from "./templates/ids"
import { theme } from "./theme"

const PORT = Number(process.env.EMAIL_PREVIEW_PORT ?? 4321)

function isTemplateId(value: string): value is EmailTemplateId {
  return (EMAIL_TEMPLATE_IDS as readonly string[]).includes(value)
}

function indexPage(): string {
  const rows = EMAIL_PREVIEWS.map(
    (preview) => `
      <li>
        <span class="id">${preview.id}</span>
        ${LOCALES.map(
          (locale) => `<a href="/${preview.id}?locale=${locale}">${locale}</a>`
        ).join("")}
      </li>`
  ).join("")

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Emails Pupitre</title>
    <style>
      body {
        margin: 0;
        padding: 48px;
        background: ${theme.color.base};
        color: ${theme.color.ink};
        font-family: ${theme.font};
        font-size: 14px;
      }
      h1 { font-family: ${theme.displayFont}; font-size: 22px; margin: 0 0 24px; }
      ul { list-style: none; margin: 0; padding: 0; max-width: 560px; }
      li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid ${theme.color.line};
        border-radius: ${theme.radius.md};
        background: ${theme.color.surface};
        margin-bottom: 8px;
      }
      .id { flex: 1; font-family: ${theme.monoFont}; font-size: 12px; }
      a {
        padding: 4px 10px;
        border-radius: ${theme.radius.sm};
        background: ${theme.color.inverse};
        color: ${theme.color["inverse-ink"]};
        text-decoration: none;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <h1>Emails Pupitre</h1>
    <ul>${rows}</ul>
  </body>
</html>`
}

function localeOfQuery(value: string | null): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE
}

const server = serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const id = url.pathname.slice(1)

    if (!id) {
      return new Response(indexPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }

    if (!isTemplateId(id)) {
      return new Response("Not Found", { status: 404 })
    }

    const email = await previewOf(id).render(
      localeOfQuery(url.searchParams.get("locale"))
    )

    if (url.searchParams.get("format") === "text") {
      return new Response(email.text, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    }

    return new Response(email.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  },
})

console.info(`[emails] preview on http://localhost:${server.port}`)
