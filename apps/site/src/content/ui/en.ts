export const en = {
  "site.name": "Pupitre",
  "site.domain": "pupitre.studio",
  "site.tagline": "A machine of their own for your AI agents.",

  "a11y.skip": "Skip to content",

  "nav.label": "Main",
  "nav.docs": "Docs",
  "nav.pricing": "Pricing",
  "nav.download": "Download",
  "nav.blog": "Blog",
  "nav.changelog": "Changelog",
  "nav.cta": "Create an account",
  "nav.menu": "Menu",
  "nav.menuClose": "Close",

  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",

  "locale.label": "Language",
  "locale.alternateName": "Français",

  "footer.tagline":
    "A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server.",
  "footer.product": "Product",
  "footer.resources": "Resources",
  "footer.legal": "Legal",
  "footer.terms": "Terms",
  "footer.privacy": "Privacy",
  "footer.licence": "Licence",
  "footer.acceptableUse": "Acceptable use",
  "footer.dpa": "Data processing",
  "footer.status": "Status",
  "footer.builtBy":
    "Built by someone who runs his own agents on a VPS every day.",

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
  "docs.searchCount": "{count} page(s)",
  "docs.next": "Next",
  "docs.previous": "Previous",
  "docs.start": "Start here",
  "docs.back": "All docs",
  "docs.updated": "Section",

  "blog.label": "Blog",
  "blog.title": "Blog — Pupitre",
  "blog.description":
    "Notes on running AI agents on a server of your own: setup, trade-offs, and what we learned building Pupitre.",
  "blog.headline": "Notes from a machine that is not a laptop.",
  "blog.lead":
    "What we learned putting agents on a machine that is not a laptop. Long, specific, no announcements.",
  "blog.by": "By",
  "blog.rss": "RSS",
  "blog.back": "All posts",
  "blog.reading": "Reading time",
  "blog.empty": "Nothing published yet.",

  "changelog.label": "Changelog",
  "changelog.title": "Changelog — Pupitre",
  "changelog.description":
    "Every release of the Pupitre desktop app and of the agent, with what changed and what it means for your server.",
  "changelog.headline": "One entry per release.",
  "changelog.lead":
    "One entry per release. What changed in the app, what changed in the agent, and what you have to do about it.",
  "changelog.beta": "Beta",
  "changelog.stable": "Stable",
  "changelog.rss": "RSS",
  "changelog.empty": "No release published yet.",
  "changelog.download": "Download this version",

  "legal.label": "Legal",
  "legal.title": "Legal — Pupitre",
  "legal.description":
    "Terms, licence, acceptable use, privacy and data processing for Pupitre.",
  "legal.headline": "The rules, written to be read.",
  "legal.lead":
    "The rules of the product, written to be read. Nothing here contradicts what the app does on your machine.",
  "legal.updated": "Updated",
  "legal.draft": "Draft",
  "legal.subProcessor": "Sub-processor",
  "legal.purpose": "Purpose",
  "legal.region": "Region",

  "notFound.title": "Not found — Pupitre",
  "notFound.description": "This page does not exist.",
  "notFound.headline": "This page does not exist.",
  "notFound.lead":
    "The link is wrong, or the page moved. The docs and the home page are still where you left them.",
  "notFound.home": "Home",
  "notFound.docs": "Read the docs",

  "consent.title": "Audience measurement",
  "consent.body":
    "We would like to count page views, without a cookie and without identifying you. Nothing is stored until you accept.",
  "consent.accept": "Accept",
  "consent.decline": "Decline",
  "consent.link": "Privacy",
} as const

export type Dictionary = Record<keyof typeof en, string>
