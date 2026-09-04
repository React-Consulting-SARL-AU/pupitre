import {
  createTestSession,
  createTestUser,
  setTestSession,
  type TestSessionInput,
  type TestUserInput,
} from "@pupitre/auth/testing"
import { bootApiTestServer } from "./index"

export async function createUser(input: TestUserInput = {}) {
  const { prisma } = await bootApiTestServer()

  return await createTestUser(prisma, input)
}

export async function createSession(input: TestSessionInput) {
  const { prisma } = await bootApiTestServer()
  const created = await createTestSession(prisma, input)

  return { ...created, headers: sessionHeaders(created.token) }
}

export function sessionHeaders(
  token: string,
  extra: HeadersInit = {}
): Headers {
  return setTestSession(new Headers(extra), { token })
}
