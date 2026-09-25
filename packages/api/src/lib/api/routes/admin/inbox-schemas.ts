import {
  MAIL_DISPLAY_NAME_MAX_LENGTH,
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
  MAIL_SIGNATURE_MAX_LENGTH,
} from "@pupitre/shared/legal"
import { t } from "elysia"
import { MAIL_DRAFT_MAX_LENGTH } from "../../../mail/drafts"
import { MAIL_NOTE_MAX_LENGTH } from "../../../mail/notes"
import {
  MAIL_TEMPLATE_BODY_MAX_LENGTH,
  MAIL_TEMPLATE_NAME_MAX_LENGTH,
} from "../../../mail/templates"
import {
  MAIL_BULK_MAX,
  MAIL_MAX_PAGE_SIZE,
  MAIL_THREAD_SORTS,
} from "../../../mail/threads"
import { dateTime } from "../../openapi-models"

export const MAIL_REPLY_MAX_LENGTH = 20_000

const MAIL_SUBJECT_MAX_LENGTH = 200

const MAIL_RECIPIENTS_MAX = 10

const MAIL_FILENAME_MAX_LENGTH = 255

const MAIL_MIME_TYPE_MAX_LENGTH = 255

const MAIL_KEY_MAX_LENGTH = 512

const MAIL_ADDRESS_MAX_LENGTH = 254

const MAIL_ID_MAX_LENGTH = 64

const MAIL_SORT_ORDER_MAX = 999

const mailSender = t.Object({
  email: t.String(),
  name: t.Nullable(t.String()),
})

const mailLinkedOrganization = t.Nullable(
  t.Object({ id: t.String(), name: t.String(), slug: t.String() })
)

export const mailMailboxSchema = t.Object(
  {
    id: t.String(),
    address: t.String(),
    display_name: t.String(),
    signature: t.Nullable(t.String()),
    sensitive: t.Boolean(),
    can_reply: t.Boolean(),
    enabled: t.Boolean(),
    sort_order: t.Integer(),
    threads: t.Integer(),
    unread: t.Integer(),
  },
  { $id: "MailMailbox" }
)

const mailMailboxRef = t.Nullable(
  t.Object({
    id: t.String(),
    address: t.String(),
    display_name: t.String(),
    signature: t.Nullable(t.String()),
    sensitive: t.Boolean(),
    can_reply: t.Boolean(),
    enabled: t.Boolean(),
  })
)

export const mailCountsSchema = t.Object(
  {
    mailboxes: t.Array(
      t.Object({ id: t.String(), unread: t.Integer(), open: t.Integer() })
    ),
    others: t.Object({
      unread: t.Integer(),
      open: t.Integer(),
      threads: t.Integer(),
    }),
    total_unread: t.Integer(),
  },
  { $id: "MailCounts" }
)

const mailThreadFields = {
  id: t.String(),
  address: t.String(),
  mailbox_id: t.Nullable(t.String()),
  subject: t.String(),
  status: t.String(),
  unread: t.Boolean(),
  assigned_user: t.Nullable(
    t.Object({ id: t.String(), name: t.String(), email: t.String() })
  ),
  contact: t.Nullable(
    t.Object({ user_id: t.String(), email: t.String(), name: t.String() })
  ),
  linked_organization: mailLinkedOrganization,
  from: mailSender,
  sender_authenticated: t.Boolean(),
  snippet: t.Nullable(t.String()),
  has_draft: t.Boolean(),
  automated: t.Boolean(),
  last_inbound_at: t.Nullable(dateTime),
  last_outbound_at: t.Nullable(dateTime),
  updated_at: dateTime,
  created_at: dateTime,
}

export const mailThreadSchema = t.Object(
  { ...mailThreadFields, messages: t.Integer(), notes: t.Integer() },
  { $id: "MailThread" }
)

export const mailMessageSchema = t.Object(
  {
    id: t.String(),
    direction: t.String(),
    from: mailSender,
    to: t.Array(t.String()),
    cc: t.Array(t.String()),
    subject: t.Nullable(t.String()),
    text: t.Nullable(t.String()),
    has_html: t.Boolean(),
    automated: t.Boolean(),
    authenticated: t.Boolean(),
    delivery: t.String(),
    error: t.Nullable(t.String()),
    sent_by: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
    received_at: dateTime,
    sent_at: t.Nullable(dateTime),
    attachments: t.Array(
      t.Object({
        id: t.String(),
        filename: t.String(),
        mime_type: t.String(),
        size: t.Integer(),
      })
    ),
  },
  { $id: "MailMessage" }
)

export const mailNoteSchema = t.Object(
  {
    id: t.String(),
    body: t.String(),
    author: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
    created_at: dateTime,
    updated_at: dateTime,
  },
  { $id: "MailNote" }
)

export const mailActivitySchema = t.Object(
  {
    id: t.String(),
    action: t.String(),
    actor: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
    metadata: t.Optional(t.Any()),
    created_at: dateTime,
  },
  { $id: "MailActivity" }
)

const mailDraftAttachment = t.Object({
  key: t.String(),
  filename: t.String(),
  mime_type: t.String(),
  size: t.Integer(),
})

export const mailDraftSchema = t.Object(
  {
    body: t.String(),
    to: t.Array(t.String()),
    cc: t.Array(t.String()),
    attachments: t.Array(mailDraftAttachment),
    updated_by: t.Nullable(t.Object({ id: t.String(), name: t.String() })),
    updated_at: dateTime,
  },
  { $id: "MailDraft" }
)

export const mailTemplateSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    body: t.String(),
    mailbox_id: t.Nullable(t.String()),
    created_at: dateTime,
    updated_at: dateTime,
  },
  { $id: "MailTemplate" }
)

/** `messages` and `notes` count in the list and carry here: the detail is the thread opened. */
export const mailThreadDetailSchema = t.Object(
  {
    ...mailThreadFields,
    mailbox: mailMailboxRef,
    messages: t.Array(mailMessageSchema),
    notes: t.Array(mailNoteSchema),
    activities: t.Array(mailActivitySchema),
    draft: t.Nullable(mailDraftSchema),
  },
  { $id: "MailThreadDetail" }
)

export const mailThreadsQuery = t.Object({
  status: t.Optional(t.UnionEnum(["open", "closed"])),
  unread: t.Optional(t.Boolean()),
  q: t.Optional(t.String({ maxLength: MAIL_ADDRESS_MAX_LENGTH })),
  address: t.Optional(t.String({ maxLength: MAIL_ADDRESS_MAX_LENGTH })),
  mailbox_id: t.Optional(t.String({ maxLength: MAIL_ID_MAX_LENGTH })),
  organization_id: t.Optional(t.String({ maxLength: MAIL_ID_MAX_LENGTH })),
  automated: t.Optional(t.Boolean()),
  assigned: t.Optional(t.String({ maxLength: MAIL_ID_MAX_LENGTH })),
  sort: t.Optional(t.UnionEnum([...MAIL_THREAD_SORTS])),
  direction: t.Optional(t.UnionEnum(["asc", "desc"])),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: MAIL_MAX_PAGE_SIZE })),
  offset: t.Optional(t.Integer({ minimum: 0 })),
})

export const mailThreadPatchBody = t.Object({
  status: t.Optional(t.UnionEnum(["open", "closed"])),
  unread: t.Optional(t.Boolean()),
  assigned_user_id: t.Optional(
    t.Nullable(t.String({ maxLength: MAIL_ID_MAX_LENGTH }))
  ),
  linked_organization_id: t.Optional(
    t.Nullable(t.String({ maxLength: MAIL_ID_MAX_LENGTH }))
  ),
})

export const mailBulkBody = t.Object({
  ids: t.Array(t.String({ maxLength: MAIL_ID_MAX_LENGTH }), {
    minItems: 1,
    maxItems: MAIL_BULK_MAX,
  }),
  status: t.Optional(t.UnionEnum(["open", "closed"])),
  unread: t.Optional(t.Boolean()),
})

export const mailBulkSchema = t.Object(
  { updated: t.Integer() },
  { $id: "MailBulkResult" }
)

const mailDisplayName = t.String({
  minLength: 1,
  maxLength: MAIL_DISPLAY_NAME_MAX_LENGTH,
})

const mailSignature = t.Nullable(
  t.String({ maxLength: MAIL_SIGNATURE_MAX_LENGTH })
)

export const mailboxCreateBody = t.Object({
  address: t.String({ minLength: 1, maxLength: MAIL_ADDRESS_MAX_LENGTH }),
  display_name: mailDisplayName,
  signature: t.Optional(mailSignature),
  sensitive: t.Optional(t.Boolean()),
  can_reply: t.Optional(t.Boolean()),
})

export const mailboxPatchBody = t.Object({
  display_name: t.Optional(mailDisplayName),
  signature: t.Optional(mailSignature),
  sensitive: t.Optional(t.Boolean()),
  can_reply: t.Optional(t.Boolean()),
  enabled: t.Optional(t.Boolean()),
  sort_order: t.Optional(
    t.Integer({ minimum: 0, maximum: MAIL_SORT_ORDER_MAX })
  ),
})

export const mailNoteBody = t.Object({
  body: t.String({ minLength: 1, maxLength: MAIL_NOTE_MAX_LENGTH }),
})

const mailAddressList = t.Array(t.String({ format: "email" }), {
  maxItems: MAIL_RECIPIENTS_MAX,
})

export const mailDraftBody = t.Object({
  body: t.String({ maxLength: MAIL_DRAFT_MAX_LENGTH }),
  to: t.Optional(mailAddressList),
  cc: t.Optional(mailAddressList),
  attachments: t.Optional(
    t.Array(mailDraftAttachment, { maxItems: MAIL_MAX_OUTBOUND_ATTACHMENTS })
  ),
})

export const mailTemplateBody = t.Object({
  name: t.String({ minLength: 1, maxLength: MAIL_TEMPLATE_NAME_MAX_LENGTH }),
  body: t.String({ minLength: 1, maxLength: MAIL_TEMPLATE_BODY_MAX_LENGTH }),
  mailbox_id: t.Optional(
    t.Nullable(t.String({ maxLength: MAIL_ID_MAX_LENGTH }))
  ),
})

export const mailTemplatePatchBody = t.Object({
  name: t.Optional(
    t.String({ minLength: 1, maxLength: MAIL_TEMPLATE_NAME_MAX_LENGTH })
  ),
  body: t.Optional(
    t.String({ minLength: 1, maxLength: MAIL_TEMPLATE_BODY_MAX_LENGTH })
  ),
  mailbox_id: t.Optional(
    t.Nullable(t.String({ maxLength: MAIL_ID_MAX_LENGTH }))
  ),
})

export const mailTemplatesQuery = t.Object({
  mailbox_id: t.Optional(t.String({ maxLength: MAIL_ID_MAX_LENGTH })),
})

const mailFilename = t.String({
  minLength: 1,
  maxLength: MAIL_FILENAME_MAX_LENGTH,
})

const mailMimeType = t.String({
  minLength: 1,
  maxLength: MAIL_MIME_TYPE_MAX_LENGTH,
  pattern: "^[\\w.+-]+/[\\w.+-]+$",
})

const mailAttachmentSize = t.Integer({
  minimum: 1,
  maximum: MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
})

export const mailUploadBody = t.Object({
  filename: mailFilename,
  mime_type: mailMimeType,
  size: mailAttachmentSize,
})

export const mailUploadSchema = t.Object(
  { key: t.String(), url: t.String(), expires_at: dateTime },
  { $id: "MailUpload" }
)

export const mailAttachmentUrlQuery = t.Object({
  disposition: t.Optional(t.UnionEnum(["inline", "attachment"])),
})

export const mailAttachmentUrlSchema = t.Object(
  {
    url: t.String(),
    expires_at: dateTime,
    mime_type: t.String(),
    filename: t.String(),
    size: t.Integer(),
  },
  { $id: "MailAttachmentUrl" }
)

/** What a reply or a new message carries: uploads already in the bucket, named by their key. */
const mailOutboundAttachments = t.Optional(
  t.Array(
    t.Object({
      key: t.String({ minLength: 1, maxLength: MAIL_KEY_MAX_LENGTH }),
      filename: mailFilename,
      mime_type: mailMimeType,
      size: mailAttachmentSize,
    }),
    { maxItems: MAIL_MAX_OUTBOUND_ATTACHMENTS }
  )
)

export const mailReplyBody = t.Object({
  text: t.String({ minLength: 1, maxLength: MAIL_REPLY_MAX_LENGTH }),
  to: t.Optional(mailAddressList),
  cc: t.Optional(mailAddressList),
  attachments: mailOutboundAttachments,
})

export const mailComposeBody = t.Object({
  mailbox_id: t.String({ minLength: 1, maxLength: MAIL_ID_MAX_LENGTH }),
  to: t.Array(t.String({ format: "email" }), {
    minItems: 1,
    maxItems: MAIL_RECIPIENTS_MAX,
  }),
  subject: t.String({ minLength: 1, maxLength: MAIL_SUBJECT_MAX_LENGTH }),
  text: t.String({ minLength: 1, maxLength: MAIL_REPLY_MAX_LENGTH }),
  attachments: mailOutboundAttachments,
})
