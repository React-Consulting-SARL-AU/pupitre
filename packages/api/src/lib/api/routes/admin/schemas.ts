import { ADMIN_MAX_PAGE_SIZE } from "@pupitre/shared/platform"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"

export const adminLimitSchema = t.Optional(
  t.Integer({ minimum: 1, maximum: ADMIN_MAX_PAGE_SIZE })
)

export const adminOffsetSchema = t.Optional(t.Integer({ minimum: 0 }))

// `t.UnionEnum` carries a default, which a filter must not have.
export const adminDirectionSchema = t.Optional(
  t.Union([t.Literal("asc"), t.Literal("desc")])
)

/** Every gesture the team takes against someone carries its reason into the journal. */
export const adminReasonBody = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
})

export const adminEventSchema = t.Object(
  {
    id: t.String(),
    action: t.String(),
    target_type: t.String(),
    target_id: t.String(),
    payload: t.Unknown(),
    created_at: dateTime,
    organization: t.Nullable(
      t.Object({ id: t.String(), name: t.String(), slug: t.String() })
    ),
    actor: t.Nullable(
      t.Object({ id: t.String(), email: t.String(), name: t.String() })
    ),
  },
  { $id: "AdminEvent" }
)

export const adminEventsQuery = t.Object({
  organization_id: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  actor_user_id: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  action: t.Optional(t.String({ maxLength: 60 })),
  target_type: t.Optional(t.String({ maxLength: 40 })),
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})
