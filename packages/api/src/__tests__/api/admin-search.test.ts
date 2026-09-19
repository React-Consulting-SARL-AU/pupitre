import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { PLATFORM_SEARCH_RESULTS } from "@pupitre/shared/platform"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface SearchBody {
  data: {
    users: { id: string; email: string; name: string; state: string }[]
    organizations: { id: string; name: string; slug: string }[]
    servers: {
      id: string
      name: string
      host: string | null
      organization: { id: string; name: string }
    }[]
    threads: { id: string; subject: string; address: string }[]
  }
}

interface ErrorBody {
  error: { code: string }
}

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function populate() {
  const { organization } = await createOrganizationWithMembers({
    name: "Atelier Marmotte",
    roles: ["owner"],
  })

  await createUser({ email: "marmotte@test.local", name: "Marmotte Cliente" })
  await createServer({
    organizationId: organization.id,
    name: "vps-marmotte",
  })
  await harness.prisma.mailThread.create({
    data: {
      address: "support@pupitre.studio",
      subject: "La marmotte ne répond plus",
      normalizedSubject: "la marmotte ne repond plus",
    },
  })

  return organization
}

describe("GET /admin/search", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("rend les comptes, les organisations, les serveurs et les conversations qui correspondent", async () => {
    const organization = await populate()
    const admin = await platformAdmin()
    const response = await apiRequest<SearchBody>("/admin/search?q=marmotte", {
      session: admin,
    })

    expect(response.status).toBe(200)
    expect(response.json.data.users.map((user) => user.email)).toContain(
      "marmotte@test.local"
    )
    expect(response.json.data.users[0].state).toBe("active")
    expect(response.json.data.organizations.map((found) => found.id)).toContain(
      organization.id
    )
    expect(response.json.data.servers[0].name).toBe("vps-marmotte")
    expect(response.json.data.servers[0].organization.name).toBe(
      "Atelier Marmotte"
    )
    expect(response.json.data.threads[0].subject).toContain("marmotte")
  })

  it("ignore la casse et rend cinq résultats par groupe au plus", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    for (let index = 0; index < PLATFORM_SEARCH_RESULTS + 3; index += 1) {
      await createServer({
        organizationId: organization.id,
        name: `vps-heron-${index}`,
      })
    }

    const admin = await platformAdmin()
    const response = await apiRequest<SearchBody>("/admin/search?q=HERON", {
      session: admin,
    })

    expect(response.status).toBe(200)
    expect(response.json.data.servers).toHaveLength(PLATFORM_SEARCH_RESULTS)
  })

  it("rend l'état du compte que la plateforme calcule, pas un état à part", async () => {
    const { user } = await createUser({
      email: "marmotte@test.local",
      name: "Marmotte Suspendue",
    })

    await harness.prisma.user.update({
      where: { id: user.id },
      data: { banned: true, banExpires: null },
    })

    const deactivated = await createUser({
      email: "loir@test.local",
      name: "Loir Endormi",
    })

    await harness.prisma.user.update({
      where: { id: deactivated.user.id },
      data: { deactivatedAt: new Date() },
    })

    const admin = await platformAdmin()
    const response = await apiRequest<SearchBody>(
      "/admin/search?q=test.local",
      {
        session: admin,
      }
    )
    const states = new Map(
      response.json.data.users.map((found) => [found.email, found.state])
    )

    expect(response.status).toBe(200)
    expect(states.get("marmotte@test.local")).toBe("suspended")
    expect(states.get("loir@test.local")).toBe("deactivated")
  })

  it("refuse une recherche trop courte", async () => {
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>("/admin/search?q=a", {
      session: admin,
    })

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
  })

  it("refuse un anonyme et un compte hors de l'organisation Pupitre", async () => {
    const { members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const anonymous = await apiRequest("/admin/search?q=atelier")
    const owner = await apiRequest("/admin/search?q=atelier", {
      session: members[0],
    })

    expect(anonymous.status).toBe(401)
    expect(owner.status).toBe(403)
  })
})
