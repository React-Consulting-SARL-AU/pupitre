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

const ADMIN: Crumb = { title: "nav.admin", to: "/dashboard/admin" }

const ADMIN_USERS: Crumb = {
  title: "nav.adminUsers",
  to: "/dashboard/admin/users",
}

const ADMIN_ORGANIZATIONS: Crumb = {
  title: "nav.adminOrganizations",
  to: "/dashboard/admin/organizations",
}

const ADMIN_SERVERS: Crumb = {
  title: "nav.adminServers",
  to: "/dashboard/admin/servers",
}

const ADMIN_SUBSCRIPTIONS: Crumb = {
  title: "nav.adminSubscriptions",
  to: "/dashboard/admin/subscriptions",
}

const ADMIN_LINKS: Crumb = {
  title: "nav.adminAffiliateLinks",
  to: "/dashboard/admin/affiliate-links",
}

const ADMIN_INBOX: Crumb = {
  title: "nav.adminInbox",
  to: "/dashboard/admin/inbox",
}

const TITLES: Record<string, PageTitle> = {
  "/dashboard/admin": { title: "nav.admin", parents: [] },
  "/dashboard/admin/inbox": { title: "nav.adminInbox", parents: [ADMIN] },
  "/dashboard/admin/inbox/": { title: "nav.adminInbox", parents: [ADMIN] },
  "/dashboard/admin/inbox/$threadId": {
    title: "nav.adminThread",
    parents: [ADMIN, ADMIN_INBOX],
  },
  "/dashboard/admin/inbox/mailboxes": {
    title: "nav.adminInboxMailboxes",
    parents: [ADMIN, ADMIN_INBOX],
  },
  "/dashboard/admin/users": { title: "nav.adminUsers", parents: [ADMIN] },
  "/dashboard/admin/users/$id": {
    title: "nav.adminUser",
    parents: [ADMIN, ADMIN_USERS],
  },
  "/dashboard/admin/organizations": {
    title: "nav.adminOrganizations",
    parents: [ADMIN],
  },
  "/dashboard/admin/organizations/$id": {
    title: "nav.adminOrganization",
    parents: [ADMIN, ADMIN_ORGANIZATIONS],
  },
  "/dashboard/admin/servers": { title: "nav.adminServers", parents: [ADMIN] },
  "/dashboard/admin/servers/$id": {
    title: "nav.server",
    parents: [ADMIN, ADMIN_SERVERS],
  },
  "/dashboard/admin/subscriptions": {
    title: "nav.adminSubscriptions",
    parents: [ADMIN],
  },
  "/dashboard/admin/subscriptions/$id": {
    title: "nav.adminSubscription",
    parents: [ADMIN, ADMIN_SUBSCRIPTIONS],
  },
  "/dashboard/admin/affiliate-links": {
    title: "nav.adminAffiliateLinks",
    parents: [ADMIN],
  },
  "/dashboard/admin/affiliate-links/$id": {
    title: "nav.adminAffiliateLink",
    parents: [ADMIN, ADMIN_LINKS],
  },
  "/dashboard/admin/events": { title: "nav.adminEvents", parents: [ADMIN] },
  "/dashboard/admin/releases": { title: "nav.adminReleases", parents: [ADMIN] },
  "/dashboard/admin/team": { title: "nav.adminTeam", parents: [ADMIN] },
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
