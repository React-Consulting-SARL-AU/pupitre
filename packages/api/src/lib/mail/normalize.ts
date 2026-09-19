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

/**
 * The ids a References or In-Reply-To header names. Angle brackets are the
 * rule but not the habit: a header without them still names one id.
 */
export function referencedMessageIds(
  ...headers: (string | null | undefined)[]
): string[] {
  const ids: string[] = []

  for (const header of headers) {
    if (!header) {
      continue
    }

    const bracketed = [...header.matchAll(ANGLE_IDS_RE)].map((match) =>
      match[1].trim()
    )
    const found =
      bracketed.length > 0 ? bracketed : header.trim().split(WHITESPACE_RE)

    for (const id of found) {
      if (id && !ids.includes(id)) {
        ids.push(id)
      }
    }
  }

  return ids
}

export function buildReferences(
  previousReferences: string | null | undefined,
  previousMessageId: string | null | undefined
): string | null {
  const ids = referencedMessageIds(previousReferences)

  if (previousMessageId && !ids.includes(previousMessageId)) {
    ids.push(previousMessageId)
  }

  return ids.length > 0 ? ids.map((id) => `<${id}>`).join(" ") : null
}
