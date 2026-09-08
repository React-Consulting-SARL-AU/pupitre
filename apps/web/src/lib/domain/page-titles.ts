import type { Locale } from "@pupitre/shared/i18n"
import type { DictionaryKey } from "@/lib/i18n/en"
import { translator } from "@/lib/i18n/i18n"
import type { FileRouteTypes } from "@/routeTree.gen"

export interface Crumb {
  title: DictionaryKey
  to: FileRouteTypes["to"]
}

export interface PageTitle {
  title: DictionaryKey
  parents: Crumb[]
}

/**
 * A breadcrumb only lists pages you can go back to. `/dashboard` isn't one:
 * it redirects to servers. So it never appears, and a page with no parent
 * shows no breadcrumb.
 */
const SERVERS: Crumb = { title: "nav.servers", to: "/dashboard/servers" }

const TITLES: Record<string, PageTitle> = {
  "/dashboard": { title: "nav.dashboard", parents: [] },
  "/dashboard/start": { title: "nav.start", parents: [] },
  "/dashboard/servers": { title: "nav.servers", parents: [] },
  "/dashboard/servers/$id": { title: "nav.server", parents: [SERVERS] },
  "/dashboard/members": { title: "nav.members", parents: [] },
  "/dashboard/audit": { title: "nav.audit", parents: [] },
  "/dashboard/devices": { title: "nav.devices", parents: [] },
  "/dashboard/billing": { title: "nav.billing", parents: [] },
  "/dashboard/settings": { title: "nav.settings", parents: [] },
  "/dashboard/organization": { title: "nav.organization", parents: [] },
  "/dashboard/download": { title: "nav.download", parents: [] },
  "/download": { title: "nav.download", parents: [] },
  "/auth/sign-in": { title: "auth.signIn.title", parents: [] },
  "/auth/device": { title: "auth.device.title", parents: [] },
  "/auth/two-factor": { title: "auth.twoFactor.title", parents: [] },
  "/auth/invitation/$id": { title: "auth.invitation.title", parents: [] },
}

const FALLBACK: PageTitle = { title: "app.name", parents: [] }

export function pageTitle(routeId: string): PageTitle {
  return TITLES[routeId] ?? FALLBACK
}

/** Runs in a route's `head`, outside React, so it takes the locale of the match. */
export function documentTitle(routeId: string, locale: Locale): string {
  const t = translator(locale)

  return `${t(pageTitle(routeId).title)} · ${t("app.name")}`
}

/** A server titles its tab with its own name; before the loader answers, with the generic one. */
export function serverDocumentTitle(
  name: string | null | undefined,
  locale: Locale
): string {
  const t = translator(locale)

  return `${name ?? t(pageTitle("/dashboard/servers/$id").title)} · ${t("app.name")}`
}
