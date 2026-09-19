import { ApiError, unwrap } from "@pupitre/api/client"
import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import { INBOX_POLL_INTERVAL_MS } from "@/lib/domain/inbox"

type InboxApi = ReturnType<typeof api>["api"]["v1"]["admin"]["inbox"]

export type ThreadPageQuery = NonNullable<
  NonNullable<Parameters<InboxApi["threads"]["get"]>[0]>["query"]
>

export type ThreadStatus = NonNullable<ThreadPageQuery["status"]>

export type ThreadSort = NonNullable<ThreadPageQuery["sort"]>

export type ThreadDirection = NonNullable<ThreadPageQuery["direction"]>

export const inboxKeys = {
  threads: (page: ThreadPageQuery) => ["inbox", "threads", page] as const,
  allThreads: ["inbox", "threads"] as const,
  thread: (id: string) => ["inbox", "thread", id] as const,
  attachmentUrl: (id: string) => ["inbox", "attachment", id] as const,
  mailboxes: ["inbox", "mailboxes"] as const,
  counts: ["inbox", "counts"] as const,
  templates: (mailboxId: string) => ["inbox", "templates", mailboxId] as const,
  allTemplates: ["inbox", "templates"] as const,
  team: ["inbox", "team"] as const,
}

async function readThreads(page: ThreadPageQuery) {
  return unwrap(await api().api.v1.admin.inbox.threads.get({ query: page }))
}

type InboxThreadPage = Awaited<ReturnType<typeof readThreads>>

export type InboxThread = InboxThreadPage["data"][number]

export function inboxThreadsQueryOptions(page: ThreadPageQuery) {
  return queryOptions({
    queryKey: inboxKeys.threads(page),
    queryFn: () => readThreads(page),
    placeholderData: keepPreviousData,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

async function readThread(id: string) {
  return unwrap(await api().api.v1.admin.inbox.threads({ id }).get()).data
}

type InboxThreadDetail = Awaited<ReturnType<typeof readThread>>

export type InboxMessage = InboxThreadDetail["messages"][number]

export type InboxNote = InboxThreadDetail["notes"][number]

export type InboxActivity = InboxThreadDetail["activities"][number]

export function inboxThreadQueryOptions(id: string) {
  return queryOptions({
    queryKey: inboxKeys.thread(id),
    queryFn: () => readThread(id),
  })
}

async function readMailboxes() {
  return unwrap(await api().api.v1.admin.inbox.mailboxes.get()).data
}

export type InboxMailbox = Awaited<ReturnType<typeof readMailboxes>>[number]

export function inboxMailboxesQueryOptions() {
  return queryOptions({
    queryKey: inboxKeys.mailboxes,
    queryFn: readMailboxes,
  })
}

async function readCounts() {
  return unwrap(await api().api.v1.admin.inbox.counts.get()).data
}

export type InboxCounts = Awaited<ReturnType<typeof readCounts>>

export function inboxCountsQueryOptions() {
  return queryOptions({
    queryKey: inboxKeys.counts,
    queryFn: readCounts,
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

async function readTemplates(mailboxId: string) {
  return unwrap(
    await api().api.v1.admin.inbox.templates.get({
      query: mailboxId === "" ? {} : { mailbox_id: mailboxId },
    })
  ).data
}

export type InboxTemplate = Awaited<ReturnType<typeof readTemplates>>[number]

export function inboxTemplatesQueryOptions(mailboxId: string) {
  return queryOptions({
    queryKey: inboxKeys.templates(mailboxId),
    queryFn: () => readTemplates(mailboxId),
  })
}

async function readTeam() {
  return unwrap(await api().api.v1.admin.team.get()).data
}

export function platformTeamQueryOptions() {
  return queryOptions({
    queryKey: inboxKeys.team,
    queryFn: readTeam,
  })
}

export type ThreadPatch = Parameters<
  ReturnType<InboxApi["threads"]>["patch"]
>[0]

export function patchThread(id: string, patch: ThreadPatch): Promise<void> {
  return api()
    .api.v1.admin.inbox.threads({ id })
    .patch(patch)
    .then((response) => {
      unwrap(response)
    })
}

export type ThreadBulkPatch = Parameters<InboxApi["threads"]["bulk"]["post"]>[0]

export function bulkPatchThreads(body: ThreadBulkPatch): Promise<number> {
  return api()
    .api.v1.admin.inbox.threads.bulk.post(body)
    .then((response) => unwrap(response).data.updated)
}

export type MailboxInput = Parameters<InboxApi["mailboxes"]["post"]>[0]

export async function createMailbox(input: MailboxInput) {
  const body = unwrap(await api().api.v1.admin.inbox.mailboxes.post(input))

  if (!("data" in body)) {
    throw new ApiError(500, body, "the mailbox came back without data")
  }

  return body.data
}

export type MailboxPatch = Parameters<
  ReturnType<InboxApi["mailboxes"]>["patch"]
>[0]

export function patchMailbox(id: string, patch: MailboxPatch): Promise<void> {
  return api()
    .api.v1.admin.inbox.mailboxes({ id })
    .patch(patch)
    .then((response) => {
      unwrap(response)
    })
}

export function deleteMailbox(id: string): Promise<void> {
  return api()
    .api.v1.admin.inbox.mailboxes({ id })
    .delete()
    .then((response) => {
      unwrap(response)
    })
}

export type NoteInput = Parameters<
  ReturnType<InboxApi["threads"]>["notes"]["post"]
>[0]

export function createNote(id: string, input: NoteInput): Promise<void> {
  return api()
    .api.v1.admin.inbox.threads({ id })
    .notes.post(input)
    .then((response) => {
      unwrap(response)
    })
}

export function deleteNote(id: string, noteId: string): Promise<void> {
  return api()
    .api.v1.admin.inbox.threads({ id })
    .notes({ noteId })
    .delete()
    .then((response) => {
      unwrap(response)
    })
}

export type DraftInput = Parameters<
  ReturnType<InboxApi["threads"]>["draft"]["put"]
>[0]

export function saveDraft(id: string, input: DraftInput): Promise<void> {
  return api()
    .api.v1.admin.inbox.threads({ id })
    .draft.put(input)
    .then((response) => {
      unwrap(response)
    })
}

export type TemplateInput = Parameters<InboxApi["templates"]["post"]>[0]

export function createTemplate(input: TemplateInput): Promise<void> {
  return api()
    .api.v1.admin.inbox.templates.post(input)
    .then((response) => {
      unwrap(response)
    })
}

export type TemplatePatch = Parameters<
  ReturnType<InboxApi["templates"]>["patch"]
>[0]

export function patchTemplate(id: string, patch: TemplatePatch): Promise<void> {
  return api()
    .api.v1.admin.inbox.templates({ id })
    .patch(patch)
    .then((response) => {
      unwrap(response)
    })
}

export function deleteTemplate(id: string): Promise<void> {
  return api()
    .api.v1.admin.inbox.templates({ id })
    .delete()
    .then((response) => {
      unwrap(response)
    })
}

export type AttachmentDisposition = NonNullable<
  NonNullable<
    Parameters<ReturnType<InboxApi["attachments"]>["url"]["get"]>[0]
  >["query"]
>["disposition"]

/** Signed for a few minutes: asked for when the viewer opens, never at render. */
export async function attachmentUrl(
  id: string,
  disposition: AttachmentDisposition
) {
  return unwrap(
    await api()
      .api.v1.admin.inbox.attachments({ id })
      .url.get({ query: { disposition } })
  ).data
}

export type UploadRequest = Parameters<InboxApi["uploads"]["post"]>[0]

export async function requestUpload(meta: UploadRequest) {
  const body = unwrap(await api().api.v1.admin.inbox.uploads.post(meta))

  // Eden folds a 201 handler's return under 200 as well, next to the error shape.
  if (!("data" in body)) {
    throw new ApiError(500, body, "the upload slot came back without data")
  }

  return body.data
}

export type ReplyBody = Parameters<
  ReturnType<InboxApi["threads"]>["reply"]["post"]
>[0]

export type OutboundAttachment = NonNullable<ReplyBody["attachments"]>[number]

export class AttachmentUploadError extends Error {
  readonly filename: string
  readonly status: number

  constructor(filename: string, status: number) {
    super(`upload of ${filename} refused with ${status}`)
    this.name = "AttachmentUploadError"
    this.filename = filename
    this.status = status
  }
}

const FALLBACK_MIME_TYPE = "application/octet-stream"

/** The file goes straight to the bucket: the Worker only signs the slot. */
export async function uploadAttachment(
  file: File
): Promise<OutboundAttachment> {
  const mimeType = file.type === "" ? FALLBACK_MIME_TYPE : file.type
  const meta = { filename: file.name, mime_type: mimeType, size: file.size }
  const slot = await requestUpload(meta)
  const stored = await fetch(slot.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": mimeType },
  })

  if (!stored.ok) {
    throw new AttachmentUploadError(file.name, stored.status)
  }

  return { key: slot.key, ...meta }
}

/** One after the other, naming each as it leaves; the first refusal stops the rest. */
export async function uploadAttachments(
  files: readonly File[],
  onStart: (file: File) => void
): Promise<OutboundAttachment[]> {
  const uploaded: OutboundAttachment[] = []

  for (const file of files) {
    onStart(file)
    uploaded.push(await uploadAttachment(file))
  }

  return uploaded
}

/** The thread is refetched right after: the answer only has to be a success. */
export function replyToThread(id: string, body: ReplyBody): Promise<void> {
  return api()
    .api.v1.admin.inbox.threads({ id })
    .reply.post(body)
    .then((response) => {
      unwrap(response)
    })
}

export type ComposeEmail = Parameters<InboxApi["compose"]["post"]>[0]

export async function composeEmail(input: ComposeEmail): Promise<string> {
  const body = unwrap(await api().api.v1.admin.inbox.compose.post(input))

  if (!("data" in body) || body.data === null) {
    throw new ApiError(500, body, "the thread came back without data")
  }

  return body.data.id
}
