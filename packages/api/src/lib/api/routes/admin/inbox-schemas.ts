import {
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
  MAIL_SENDER_ADDRESSES,
} from "@pupitre/shared/legal"
import { t } from "elysia"
import { MAIL_MAX_PAGE_SIZE } from "../../../mail/threads"
import { dateTime } from "../../openapi-models"

export const MAIL_REPLY_MAX_LENGTH = 20_000

const MAIL_SUBJECT_MAX_LENGTH = 200

const MAIL_RECIPIENTS_MAX = 10

const MAIL_FILENAME_MAX_LENGTH = 255

const MAIL_MIME_TYPE_MAX_LENGTH = 255

const MAIL_KEY_MAX_LENGTH = 512

const mailSender = t.Object({
  email: t.String(),
  name: t.Nullable(t.String()),
})

const mailThreadFields = {
  id: t.String(),
  address: t.String(),
  subject: t.String(),
  status: t.String(),
  unread: t.Boolean(),
  assigned_user: t.Nullable(
    t.Object({ id: t.String(), name: t.String(), email: t.String() })
  ),
  contact: t.Nullable(
    t.Object({ user_id: t.String(), email: t.String(), name: t.String() })
  ),
  from: mailSender,
  snippet: t.Nullable(t.String()),
  messages: t.Integer(),
  last_inbound_at: t.Nullable(dateTime),
  last_outbound_at: t.Nullable(dateTime),
  updated_at: dateTime,
  created_at: dateTime,
}

export const mailThreadSchema = t.Object(mailThreadFields, {
  $id: "MailThread",
})

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

/** `messages` counts them in the list and carries them here: the detail is the thread opened. */
export const mailThreadDetailSchema = t.Object(
  { ...mailThreadFields, messages: t.Array(mailMessageSchema) },
  { $id: "MailThreadDetail" }
)

export const mailThreadsQuery = t.Object({
  status: t.Optional(t.UnionEnum(["open", "closed"])),
  unread: t.Optional(t.Boolean()),
  q: t.Optional(t.String({ maxLength: 254 })),
  address: t.Optional(t.String({ maxLength: 254 })),
  assigned: t.Optional(t.String({ maxLength: 64 })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: MAIL_MAX_PAGE_SIZE })),
  offset: t.Optional(t.Integer({ minimum: 0 })),
})

export const mailThreadPatchBody = t.Object({
  status: t.Optional(t.UnionEnum(["open", "closed"])),
  unread: t.Optional(t.Boolean()),
  assigned_user_id: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
})

const mailFilename = t.String({
  minLength: 1,
  maxLength: MAIL_FILENAME_MAX_LENGTH,
})

const mailMimeType = t.String({
  minLength: 1,
  maxLength: MAIL_MIME_TYPE_MAX_LENGTH,
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
  attachments: mailOutboundAttachments,
})

export const mailComposeBody = t.Object({
  from: t.UnionEnum([...MAIL_SENDER_ADDRESSES]),
  to: t.Array(t.String({ format: "email" }), {
    minItems: 1,
    maxItems: MAIL_RECIPIENTS_MAX,
  }),
  subject: t.String({ minLength: 1, maxLength: MAIL_SUBJECT_MAX_LENGTH }),
  text: t.String({ minLength: 1, maxLength: MAIL_REPLY_MAX_LENGTH }),
  attachments: mailOutboundAttachments,
})
