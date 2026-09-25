import { MAIL_MAX_REFERENCES } from "@pupitre/shared/legal"

const SUBJECT_PREFIX_RE = /^\s*(?:re|ref|réf|fw|fwd|tr)\s*(?:\[\d+\])?\s*:\s*/i

const WHITESPACE_RE = /\s+/g

const ANGLE_IDS_RE = /<([^<>]+)>/g

const LEADING_ANGLE_RE = /^</

const TRAILING_ANGLE_RE = />$/

export const SNIPPET_LENGTH = 160

export function stripAngles(value: string): string {
  return value
    .trim()
    .replace(LEADING_ANGLE_RE, "")
    .replace(TRAILING_ANGLE_RE, "")
    .trim()
}

function stripSubjectPrefixes(subject: string): string {
  let stripped = subject

  while (SUBJECT_PREFIX_RE.test(stripped)) {
    stripped = stripped.replace(SUBJECT_PREFIX_RE, "")
  }

  return stripped.trim()
}

export function normalizeSubject(subject: string): string {
  return stripSubjectPrefixes(subject)
    .replace(WHITESPACE_RE, " ")
    .trim()
    .toLowerCase()
}

export function replySubject(subject: string): string {
  const stripped = stripSubjectPrefixes(subject)

  return stripped ? `Re: ${stripped}` : "Re:"
}

export function snippetOf(text: string | null | undefined): string | null {
  const collapsed = text?.replace(WHITESPACE_RE, " ").trim()

  if (!collapsed) {
    return null
  }

  return collapsed.slice(0, SNIPPET_LENGTH)
}

function idsIn(header: string): string[] {
  const bracketed = [...header.matchAll(ANGLE_IDS_RE)].map((match) =>
    match[1].trim()
  )

  return bracketed.length > 0 ? bracketed : header.trim().split(WHITESPACE_RE)
}

/**
 * The ids a References or In-Reply-To header names, oldest first. Angle
 * brackets are the rule but not the habit: a header without them still names
 * one id. Only the most recent `MAIL_MAX_REFERENCES` are kept, and an id named
 * again moves to the end: a chain a sender padded with thousands of ids is
 * neither looked up nor written back.
 */
export function referencedMessageIds(
  ...headers: (string | null | undefined)[]
): string[] {
  const ids = new Set<string>()

  for (const header of headers) {
    if (!header) {
      continue
    }

    for (const id of idsIn(header).slice(-MAIL_MAX_REFERENCES)) {
      if (id) {
        ids.delete(id)
        ids.add(id)
      }
    }
  }

  return [...ids].slice(-MAIL_MAX_REFERENCES)
}

export function buildReferences(
  previousReferences: string | null | undefined,
  previousMessageId: string | null | undefined
): string | null {
  const ids = referencedMessageIds(previousReferences, previousMessageId)

  return ids.length > 0 ? ids.map((id) => `<${id}>`).join(" ") : null
}
