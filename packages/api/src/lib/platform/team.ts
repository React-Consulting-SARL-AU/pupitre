import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"

export interface AdminTeamMember {
  user_id: string
  email: string
  name: string
  role: string
  created_at: Date
}

export async function listPlatformTeam(): Promise<AdminTeamMember[]> {
  const members = await getPrisma().member.findMany({
    where: { organizationId: PLATFORM_ORGANIZATION_ID },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true, name: true } } },
  })

  return members.map((member) => ({
    user_id: member.userId,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
    created_at: member.createdAt,
  }))
}
