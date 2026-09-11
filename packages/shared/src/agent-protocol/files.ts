import { z } from "zod"
import { RequestIdSchema } from "./envelope"
import { SHOT_MEDIA_TYPES } from "./processes"

/**
 * The files of the client's own tree, under one root the agent holds.
 *
 * Every path is relative to that root, which is why none of these schemas takes
 * an absolute one: where the root sits is a detail of the server, exactly as
 * the projects root is, and the app has nothing to concatenate.
 */

/** Past that a listing stops helping, and a folder of ten thousand entries is not read on a channel. */
export const FILE_LIST_LIMIT = 2000

/** The cut of a read, as a capture's: a line of about 64 KiB, never a megabyte on one line. */
export const FILE_CHUNK_BYTES = 48 * 1024

export const FILE_TEXT_MAX_BYTES = 1024 * 1024

export const FILE_IMAGE_MAX_BYTES = 16 * 1024 * 1024

export const FILE_WRITE_MAX_BYTES = 1024 * 1024

export const FILE_TEXT_MEDIA_TYPE = "text/plain"

/** What a read may carry: text, and the images the gallery already serves. Anything else is downloaded, not read. */
export const FILE_MEDIA_TYPES = [
  FILE_TEXT_MEDIA_TYPE,
  ...SHOT_MEDIA_TYPES,
] as const

export const FileMediaTypeSchema = z.enum(FILE_MEDIA_TYPES)

export type FileMediaType = z.infer<typeof FileMediaTypeSchema>

export const FILE_KINDS = ["file", "dir", "link"] as const

export const FileKindSchema = z.enum(FILE_KINDS)

export type FileKind = z.infer<typeof FileKindSchema>

/** The permission bits as an octal string, `0644`: a number would read as decimal on the way in and out. */
export const FileModeSchema = z.string().regex(/^[0-7]{4}$/)

export const FileDigestSchema = z.string().regex(/^[0-9a-f]{64}$/)

/** Base64 without line breaks, as every other body on this channel travels. */
export const FileContentSchema = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/)

/** A path relative to the root; empty is the root itself. */
export const FilePathSchema = z.string()

export const FileEntrySchema = z.object({
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

export type FsListParams = z.infer<typeof FsListParamsSchema>

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

export type FsStatParams = z.infer<typeof FsStatParamsSchema>

export const FsStatResultSchema = z.object({
  path: FilePathSchema,
  kind: FileKindSchema,
  size_bytes: z.int().nonnegative(),
  modified_at: z.string(),
  mode: FileModeSchema,
  /** Present when the agent recognises a content a read would carry, absent otherwise. */
  media_type: FileMediaTypeSchema.optional(),
  /** Only on `hash: true`: it is what a later write compares against. */
  sha256: FileDigestSchema.optional(),
})

export type FsStatResult = z.infer<typeof FsStatResultSchema>

export const FsReadParamsSchema = z.strictObject({
  path: z.string().min(1),
})

export type FsReadParams = z.infer<typeof FsReadParamsSchema>

export const FsReadResultSchema = z.object({
  path: FilePathSchema,
  media_type: FileMediaTypeSchema,
  size_bytes: z.int().nonnegative().max(FILE_IMAGE_MAX_BYTES),
  sha256: FileDigestSchema,
  chunks: z.int().nonnegative(),
})

export type FsReadResult = z.infer<typeof FsReadResultSchema>

/** The bytes of a read, one event per chunk, in order — never in the result a request log keeps whole. */
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
  /** The digest of the version the reader read; absent means the file must not exist yet. */
  sha256: FileDigestSchema.optional(),
})

export type FsWriteParams = z.infer<typeof FsWriteParamsSchema>

export const FsWriteResultSchema = z.object({
  path: FilePathSchema,
  size_bytes: z.int().nonnegative().max(FILE_WRITE_MAX_BYTES),
  sha256: FileDigestSchema,
})

export type FsWriteResult = z.infer<typeof FsWriteResultSchema>

/** What a folder made and an entry moved both answer: the path they left behind. */
export const FsPathResultSchema = z.object({
  path: FilePathSchema,
})

export type FsPathResult = z.infer<typeof FsPathResultSchema>

export const FsMkdirParamsSchema = z.strictObject({
  path: z.string().min(1),
})

export type FsMkdirParams = z.infer<typeof FsMkdirParamsSchema>

export const FsRenameParamsSchema = z.strictObject({
  path: z.string().min(1),
  to: z.string().min(1),
})

export type FsRenameParams = z.infer<typeof FsRenameParamsSchema>

export const FsRemoveParamsSchema = z.strictObject({
  path: z.string().min(1),
  recursive: z.boolean().optional(),
})

export type FsRemoveParams = z.infer<typeof FsRemoveParamsSchema>

export const FsRemoveResultSchema = z.object({
  path: FilePathSchema,
  removed: z.int().nonnegative(),
})

export type FsRemoveResult = z.infer<typeof FsRemoveResultSchema>
