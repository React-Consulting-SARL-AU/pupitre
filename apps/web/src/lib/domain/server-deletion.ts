import type { DictionaryKey } from "@/lib/i18n/en"

// Two steps: the first revokes and schedules decommissioning, the second erases the row.
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

export function purgeable(status: string): boolean {
  return deletionLook(status).deletion === "purge"
}
