import { authClient } from "@/lib/auth/client"

/** The screen that catches this writes its own sentence, in the reader's language. */
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
