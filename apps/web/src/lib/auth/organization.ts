import { authClient } from "@/lib/auth/client"

function raise(error: { message?: string } | null | undefined): never {
  throw new Error(error?.message ?? "organization_request_failed")
}

export async function removeMember(
  organizationId: string,
  memberId: string
): Promise<void> {
  const { error } = await authClient().organization.removeMember({
    organizationId,
    memberIdOrEmail: memberId,
  })

  if (error) {
    raise(error)
  }
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await authClient().organization.cancelInvitation({
    invitationId,
  })

  if (error) {
    raise(error)
  }
}

export async function createOrganization(name: string, slug: string) {
  const { data, error } = await authClient().organization.create({ name, slug })

  if (error || !data) {
    raise(error)
  }

  return data
}

export async function updateOrganization(
  organizationId: string,
  data: { name: string; slug: string }
): Promise<void> {
  const { error } = await authClient().organization.update({
    organizationId,
    data,
  })

  if (error) {
    raise(error)
  }
}

export async function setActiveOrganization(
  organizationId: string
): Promise<void> {
  const { error } = await authClient().organization.setActive({
    organizationId,
  })

  if (error) {
    raise(error)
  }
}
