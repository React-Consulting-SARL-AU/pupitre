import type { OrgRole } from "@pupitre/shared/permissions"
import { getApiAuth } from "../api/plugins/auth"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"

export interface MemberView {
  id: string
  user_id: string
  email: string
  name: string
  role: string
  created_at: Date
}

export interface InvitationView {
  id: string
  email: string
  role: string | null
  status: string
  expires_at: Date
  created_at: Date
  inviter_id: string
}

export interface MembersView {
  members: MemberView[]
  invitations: InvitationView[]
}

export interface InvitationActor {
  userId: string
  organizationId: string
  headers: Headers
}

export interface InvitationInput {
  email: string
  role: OrgRole
}

export class AlreadyMemberError extends Error {}

export async function listMembers(
  organizationId: string
): Promise<MembersView> {
  const prisma = withOrganization(getPrisma(), organizationId)
  const [members, invitations] = await Promise.all([
    prisma.member.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.invitation.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return {
    members: members.map((member) => ({
      id: member.id,
      user_id: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      created_at: member.createdAt,
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expiresAt,
      created_at: invitation.createdAt,
      inviter_id: invitation.inviterId,
    })),
  }
}

export async function findMemberUserIdByEmail(
  organizationId: string,
  email: string
): Promise<string | null> {
  const member = await withOrganization(
    getPrisma(),
    organizationId
  ).member.findFirst({
    where: { user: { email: { equals: email, mode: "insensitive" } } },
    select: { userId: true },
  })

  return member?.userId ?? null
}

export async function createInvitation(
  actor: InvitationActor,
  input: InvitationInput
): Promise<InvitationView> {
  const existing = await findMemberUserIdByEmail(
    actor.organizationId,
    input.email
  )

  if (existing) {
    throw new AlreadyMemberError(input.email)
  }

  const invitation = await getApiAuth().api.createInvitation({
    body: {
      email: input.email,
      role: input.role,
      organizationId: actor.organizationId,
      resend: true,
    },
    headers: actor.headers,
  })

  await recordEvent({
    action: "member.invited",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "invitation",
    targetId: invitation.id,
    payload: { email: input.email, role: input.role },
  })

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expires_at: invitation.expiresAt,
    created_at: new Date(),
    inviter_id: invitation.inviterId,
  }
}
