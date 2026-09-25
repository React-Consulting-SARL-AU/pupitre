import { z } from "zod"
import { RequestIdSchema } from "./envelope"
import { SHOT_MEDIA_TYPES } from "./processes"

// A folder of ten thousand entries is not read on a channel.
export const FILE_LIST_LIMIT = 2000

export const FILE_IMAGE_MAX_BYTES = 16 * 1024 * 1024

export const FILE_WRITE_MAX_BYTES = 1024 * 1024

const FILE_TEXT_MEDIA_TYPE = "text/plain"

// Anything else is downloaded, not read.
const FILE_MEDIA_TYPES = [FILE_TEXT_MEDIA_TYPE, ...SHOT_MEDIA_TYPES] as const

const FileMediaTypeSchema = z.enum(FILE_MEDIA_TYPES)

export type FileMediaType = z.infer<typeof FileMediaTypeSchema>

// `special` is a pipe, a socket or a device: listed, never read, since a read would wait on it forever.
const FILE_KINDS = ["file", "dir", "link", "special"] as const

const FileKindSchema = z.enum(FILE_KINDS)

// An octal string: a number would read as decimal on the way in and out.
const FileModeSchema = z.string().regex(/^[0-7]{4}$/)

const FileDigestSchema = z.string().regex(/^[0-9a-f]{64}$/)

const FileContentSchema = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/)

// Relative to the root the agent holds, empty for the root itself: where that root sits is the server's detail.
const FilePathSchema = z.string()

const FileEntrySchema = z.object({
  name: z.string(),
  kind: FileKindSchema,
  size_bytes: z.int().nonnegative(),
  modified_at: z.string(),
  mode: FileModeSchema,
})

export type FileEntry = z.infer<typeof FileEntrySchema>

export const FsListParamsSchema = z.strictObject({
  path: FilePathSchema,
})

export const FsListResultSchema = z.object({
  path: FilePathSchema,
  entries: z.array(FileEntrySchema),
  truncated: z.boolean(),
})

export type FsListResult = z.infer<typeof FsListResultSchema>

export const FsStatParamsSchema = z.strictObject({
  path: FilePathSchema,
  hash: z.boolean().optional(),
})

export const FsStatResultSchema = z.object({
  path: FilePathSchema,
  kind: FileKindSchema,
  size_bytes: z.int().nonnegative(),
  modified_at: z.string(),
  mode: FileModeSchema,
  // Absent when a read would not carry the content.
  media_type: FileMediaTypeSchema.optional(),
  // Only on `hash: true`: what a later write compares against.
  sha256: FileDigestSchema.optional(),
})

export type FsStatResult = z.infer<typeof FsStatResultSchema>

export const FsReadParamsSchema = z.strictObject({
  path: z.string().min(1),
})

export const FsReadResultSchema = z.object({
  path: FilePathSchema,
  media_type: FileMediaTypeSchema,
  size_bytes: z.int().nonnegative().max(FILE_IMAGE_MAX_BYTES),
  sha256: FileDigestSchema,
  chunks: z.int().nonnegative(),
})

export type FsReadResult = z.infer<typeof FsReadResultSchema>

// The bytes travel as events, never in the result a request log keeps whole.
export const FileEventSchema = z.object({
  id: RequestIdSchema,
  event: z.literal("file"),
  seq: z.int().nonnegative(),
  bytes: z.string(),
})

export type FileEvent = z.infer<typeof FileEventSchema>

export const FsWriteParamsSchema = z.strictObject({
  path: z.string().min(1),
  content: FileContentSchema,
  // The digest of the version the reader read; absent, the file must not exist yet.
  sha256: FileDigestSchema.optional(),
})

export const FsWriteResultSchema = z.object({
  path: FilePathSchema,
  size_bytes: z.int().nonnegative().max(FILE_WRITE_MAX_BYTES),
  sha256: FileDigestSchema,
})

export type FsWriteResult = z.infer<typeof FsWriteResultSchema>

export const FsPathResultSchema = z.object({
  path: FilePathSchema,
})

export type FsPathResult = z.infer<typeof FsPathResultSchema>

export const FsMkdirParamsSchema = z.strictObject({
  path: z.string().min(1),
})

export const FsRenameParamsSchema = z.strictObject({
  path: z.string().min(1),
  to: z.string().min(1),
})

export const FsRemoveParamsSchema = z.strictObject({
  path: z.string().min(1),
  recursive: z.boolean().optional(),
})

export const FsRemoveResultSchema = z.object({
  path: FilePathSchema,
  removed: z.int().nonnegative(),
})

export type FsRemoveResult = z.infer<typeof FsRemoveResultSchema>
