import type {
  AccountDeletion,
  AccountDeletionRefusal,
} from "@pupitre/auth/hooks"
import { localeOf } from "@pupitre/shared/i18n"
import { translate } from "../i18n"
import { deleteOwnAccount, SoleOwnerError } from "../platform/user-lifecycle"

const SOLE_OWNER_CODE = "SOLE_OWNER"

export async function deleteAccountFromConsole({
  userId,
  acceptLanguage,
}: AccountDeletion): Promise<AccountDeletionRefusal | null> {
  try {
    await deleteOwnAccount(userId)

    return null
  } catch (error) {
    if (error instanceof SoleOwnerError) {
      const locale = localeOf(acceptLanguage)

      return {
        code: SOLE_OWNER_CODE,
        message: translate(locale, "account_sole_owner"),
        fix: translate(locale, "account_sole_owner_fix"),
      }
    }

    throw error
  }
}
