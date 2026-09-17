import type { DictionaryKey } from "@/lib/i18n/en"

const NOT_THE_RECIPIENT = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"

export interface InvitationRefusal {
  title: DictionaryKey
  fix: DictionaryKey
}

/** The one refusal worth naming: the invitation went to another address than the session's. */
export function invitationRefusalOf(
  code: string | null | undefined
): InvitationRefusal {
  if (code === NOT_THE_RECIPIENT) {
    return {
      title: "auth.invitation.wrongEmail",
      fix: "auth.invitation.wrongEmailFix",
    }
  }

  return { title: "auth.invitation.failed", fix: "auth.invitation.failedFix" }
}
