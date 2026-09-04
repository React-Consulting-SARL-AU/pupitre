import { createTestSession, createTestUser } from "@pupitre/auth/testing"
import type { Member, ServerStatus } from "@pupitre/db/cloudflare/client"
import type { OrgRole } from "@pupitre/shared/permissions"
import { generateServerToken, hashServerToken } from "../lib/servers/tokens"
import { bootApiTestServer } from "./index"
import { sessionHeaders } from "./session"

let organizationCounter = 0
let serverCounter = 0

type TestUser = Awaited<ReturnType<typeof createTestUser>>["user"]

type TestSession = Awaited<ReturnType<typeof createTestSession>>["session"]

export interface MemberFixture {
  role: OrgRole
  user: TestUser
  member: Member
  session: TestSession
  token: string
  headers: Headers
}

export interface OrganizationWithMembersInput {
  name?: string
  roles?: OrgRole[]
}

export async function createOrganizationWithMembers({
  name,
  roles = ["owner", "admin", "member"],
}: OrganizationWithMembersInput = {}) {
  const { prisma } = await bootApiTestServer()

  organizationCounter += 1

  const slug = `org-${organizationCounter}`
  const organization = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: name ?? `Organisation ${organizationCounter}`,
      slug,
      createdAt: new Date(),
    },
  })
  const members: MemberFixture[] = []

  for (const [index, role] of roles.entries()) {
    const { user } = await createTestUser(prisma, {
      email: `${role}-${index + 1}@${slug}.test`,
    })
    const member = await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: organization.id,
        userId: user.id,
        role,
        createdAt: new Date(),
      },
    })
    const { token, session } = await createTestSession(prisma, {
      userId: user.id,
      activeOrganizationId: organization.id,
    })

    members.push({
      role,
      user,
      member,
      session,
      token,
      headers: sessionHeaders(token),
    })
  }

  return { organization, members }
}

export interface ServerInput {
  organizationId: string
  name?: string
  arch?: string
  status?: ServerStatus
  assignedUserId?: string | null
}

export async function createServer({
  organizationId,
  name,
  arch = "amd64",
  status = "active",
  assignedUserId = null,
}: ServerInput) {
  const { prisma } = await bootApiTestServer()

  serverCounter += 1

  const token = generateServerToken()
  const server = await prisma.server.create({
    data: {
      organizationId,
      name: name ?? `vps-${serverCounter}`,
      arch,
      status,
      assignedUserId,
      serverTokenHash: await hashServerToken(token),
    },
  })

  return { server, token }
}
