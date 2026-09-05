import type { Locale } from "@pupitre/shared/i18n"
import type { DictionaryKey } from "@/lib/i18n/en"
import { translator } from "@/lib/i18n/i18n"

export interface PageTitle {
  title: DictionaryKey
  parents: DictionaryKey[]
}

const TITLES: Record<string, PageTitle> = {
  "/dashboard": { title: "nav.dashboard", parents: [] },
  "/dashboard/servers": { title: "nav.servers", parents: ["nav.dashboard"] },
  "/dashboard/servers/$id": {
    title: "nav.server",
    parents: ["nav.dashboard", "nav.servers"],
  },
  "/dashboard/members": { title: "nav.members", parents: ["nav.dashboard"] },
  "/dashboard/audit": { title: "nav.audit", parents: ["nav.dashboard"] },
  "/dashboard/devices": { title: "nav.devices", parents: ["nav.dashboard"] },
  "/dashboard/billing": { title: "nav.billing", parents: ["nav.dashboard"] },
  "/dashboard/settings": { title: "nav.settings", parents: ["nav.dashboard"] },
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
