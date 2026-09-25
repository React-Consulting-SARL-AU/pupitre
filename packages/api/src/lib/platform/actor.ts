import type { OrgRole } from "@pupitre/shared/permissions"
import { ROLE_RANK } from "../api/plugins/guards"

export function actsOnPlatform(
  platformRole: OrgRole | null | undefined
): boolean {
  return (
    platformRole !== null &&
    platformRole !== undefined &&
    ROLE_RANK[platformRole] >= ROLE_RANK.admin
  )
}
