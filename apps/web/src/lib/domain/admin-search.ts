import type { LinkProps } from "@tanstack/react-router"
import type { AdminSearchResults } from "@/lib/api/admin-queries"
import { accountLook } from "@/lib/domain/admin"
import type { StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

/** The sidebar sits outside the platform layout: it asks for the dialog, the layout owns it. */
export const PLATFORM_SEARCH_EVENT = "pupitre:platform-search"

export function askForPlatformSearch(): void {
  window.dispatchEvent(new Event(PLATFORM_SEARCH_EVENT))
}

export type SearchGroup = "users" | "organizations" | "servers" | "threads"

export interface SearchHit {
  id: string
  group: SearchGroup
  groupLabel: DictionaryKey
  primary: string
  secondary: string
  /** The state badge the group carries, when the thing has a state at all. */
  look: StatusLook | null
  to: LinkProps
}

/** One flat list, in the order the arrows walk it, whatever group each hit came from. */
export function searchHits(results: AdminSearchResults): SearchHit[] {
  return [
    ...results.users.map((user) => ({
      id: `user-${user.id}`,
      group: "users" as const,
      groupLabel: "admin.search.users" as DictionaryKey,
      primary: user.name,
      secondary: user.email,
      look: accountLook(user.state),
      to: {
        to: "/dashboard/admin/users/$id",
        params: { id: user.id },
      } satisfies LinkProps,
    })),
    ...results.organizations.map((organization) => ({
      id: `organization-${organization.id}`,
      group: "organizations" as const,
      groupLabel: "admin.search.organizations" as DictionaryKey,
      primary: organization.name,
      secondary: organization.slug,
      look: null,
      to: {
        to: "/dashboard/admin/organizations/$id",
        params: { id: organization.id },
      } satisfies LinkProps,
    })),
    ...results.servers.map((server) => ({
      id: `server-${server.id}`,
      group: "servers" as const,
      groupLabel: "admin.search.servers" as DictionaryKey,
      primary: server.name,
      secondary: `${server.host ?? ""} · ${server.organization.name}`,
      look: null,
      to: {
        to: "/dashboard/admin/servers/$id",
        params: { id: server.id },
      } satisfies LinkProps,
    })),
    ...results.threads.map((thread) => ({
      id: `thread-${thread.id}`,
      group: "threads" as const,
      groupLabel: "admin.search.threads" as DictionaryKey,
      primary: thread.subject,
      secondary: thread.address,
      look: null,
      to: {
        to: "/dashboard/admin/inbox/$threadId",
        params: { threadId: thread.id },
      } satisfies LinkProps,
    })),
  ]
}
