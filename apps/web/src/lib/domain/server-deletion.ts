import type { DictionaryKey } from "@/lib/i18n/en"

/**
 * What the next click on "delete" will do to this server.
 *
 * Deletion happens in two steps: the first revokes access and schedules
 * decommissioning at seven days, the second erases the row. The button says
 * which of the two it is. Revoking keeps the page open — it now shows a
 * revoked server, its decommission date and the action that erases it;
 * erasing leads back to the list, since no page is left to look at.
 */
export type ServerDeletion = "revoke" | "purge"

export interface DeletionLook {
  deletion: ServerDeletion
  trigger: DictionaryKey
  confirm: DictionaryKey
  title: DictionaryKey
  description: DictionaryKey
}

const REVOKE: DeletionLook = {
  confirm: "serverActions.delete",
  deletion: "revoke",
  description: "serverActions.deleteDescription",
  title: "serverActions.deleteTitle",
  trigger: "serverActions.deleteServer",
}

const PURGE: DeletionLook = {
  confirm: "serverActions.purge",
  deletion: "purge",
  description: "serverActions.purgeDescription",
  title: "serverActions.purgeTitle",
  trigger: "serverActions.purgeServer",
}

export function deletionLook(status: string): DeletionLook {
  return status === "revoked" ? PURGE : REVOKE
}

/** A revoked server is the only one a click can still make disappear. */
export function purgeable(status: string): boolean {
  return deletionLook(status).deletion === "purge"
}
