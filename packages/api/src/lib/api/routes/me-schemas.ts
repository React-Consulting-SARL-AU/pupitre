import { LOCALES } from "@pupitre/shared/i18n"
import {
  MeSchema,
  ServerForUserSchema,
} from "@pupitre/shared/platform-api/account"
import { t } from "elysia"
import { fromContract } from "../contract-schema"

const localeSchema = t.UnionEnum([...LOCALES])

/** The locale, the active organization, or both: what the caller leaves out does not move. */
export const meInputBody = t.Object({
  locale: t.Optional(localeSchema),
  organization_id: t.Optional(t.String({ minLength: 1 })),
})

export const meSchema = fromContract(MeSchema, { $id: "Me" })

export const serverForUserSchema = fromContract(ServerForUserSchema, {
  $id: "ServerForUser",
})
