const UNIQUE_VIOLATION = "P2002"

export interface PublishOnce<T> {
  find: () => Promise<T | null>
  create: () => Promise<T>
  hasSameFingerprint: (published: T) => boolean
  conflict: () => Error
}

export interface PublishOnceResult<T> {
  row: T
  created: boolean
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  )
}

/**
 * Publishing an artefact twice is the normal case: a rerun of the release
 * pipeline. The same fingerprint returns what is already published, a
 * different one is a conflict, and two simultaneous publications end up on
 * the same row rather than on a unique constraint.
 */
export async function publishOnce<T>({
  find,
  create,
  hasSameFingerprint,
  conflict,
}: PublishOnce<T>): Promise<PublishOnceResult<T>> {
  const existing = await find()

  if (existing) {
    if (!hasSameFingerprint(existing)) {
      throw conflict()
    }

    return { row: existing, created: false }
  }

  try {
    return { row: await create(), created: true }
  } catch (error) {
    const concurrent = isUniqueViolation(error) ? await find() : null

    if (!concurrent) {
      throw error
    }

    if (!hasSameFingerprint(concurrent)) {
      throw conflict()
    }

    return { row: concurrent, created: false }
  }
}
