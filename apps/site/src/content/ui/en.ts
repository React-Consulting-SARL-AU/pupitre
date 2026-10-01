export const en = {
  "site.name": "Pupitre",

  "a11y.skip": "Skip to content",

  "nav.label": "Main",
  "nav.docs": "Docs",
  "nav.pricing": "Pricing",
  "nav.download": "Download",
  "nav.blog": "Blog",
  "nav.integrations": "Integrations",
  "nav.security": "Security",
  "nav.cta": "Create an account",
  "nav.source": "Source code on GitHub",
  "nav.menu": "Menu",
  "nav.menuClose": "Close",

  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",

  "locale.alternateName": "Français",

  "footer.tagline":
    "A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server.",
  "footer.product": "Product",
  "footer.resources": "Resources",
  "footer.legal": "Legal",
  "footer.terms": "Terms",
  "footer.privacy": "Privacy",
  "footer.cookies": "Cookies",
  "footer.legalNotice": "Legal notice",
  "footer.allLegal": "All legal documents",
  "footer.consent": "Audience measurement",
  "footer.status": "Status",

  "callout.info": "Note",
  "callout.warn": "Warning",
  "callout.danger": "Danger",

  "docs.label": "Documentation",
  "docs.title": "Docs — Pupitre",
  "docs.description":
    "Choose a VPS, connect the app, install your services, run your projects. Everything Pupitre does on your server, written down.",
  "docs.headline": "Everything Pupitre does on your server, written down.",
  "docs.lead":
    "From an empty Ubuntu machine to a project running behind a URL. Every page says what Pupitre does, what it asks of you, and what it leaves behind.",
  "docs.nav": "Documentation",
  "docs.contents": "On this page",
  "docs.search": "Search",
  "docs.searchPlaceholder": "Search the docs",
  "docs.searchEmpty": "No page matches.",
  "docs.next": "Next",
  "docs.previous": "Previous",
  "docs.start": "Start here",
  "docs.back": "All docs",

  "blog.label": "Blog",
  "blog.title": "Blog — Pupitre",
  "blog.description":
    "Notes on running AI agents on a server of your own: setup, trade-offs, and what we learned building Pupitre.",
  "blog.headline": "Notes from a machine that is not a laptop.",
  "blog.lead":
    "What we learned putting agents on a machine that is not a laptop.",
  "blog.by": "By",
  "blog.rss": "RSS",
  "blog.back": "All posts",
  "blog.empty": "Nothing published yet.",

  "legal.label": "Legal",
  "legal.title": "Legal — Pupitre",
  "legal.description":
    "Terms, licence, privacy, cookies, free servers, security and legal notice for Pupitre.",
  "legal.headline": "The rules, written to be read.",
  "legal.lead": "Nothing here contradicts what the app does on your machine.",
  "legal.updated": "Updated",
  "legal.subProcessor": "Sub-processor",
  "legal.purpose": "Purpose",
  "legal.region": "Region",

  "notFound.title": "Not found — Pupitre",
  "notFound.description": "This page does not exist.",
  "notFound.headline": "This page does not exist.",
  "notFound.lead": "The link is wrong, or the page moved.",
  "notFound.home": "Home",
  "notFound.docs": "Read the docs",

  "consent.title": "Audience measurement",
  "consent.body":
    "We would like to count page views, without a cookie and without identifying you. Nothing is stored until you accept.",
  "consent.accept": "Accept",
  "consent.decline": "Decline",
  "consent.link": "Cookies",
} as const

export type Dictionary = Record<keyof typeof en, string>
