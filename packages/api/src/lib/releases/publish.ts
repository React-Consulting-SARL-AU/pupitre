import { isUniqueViolation } from "../api/prisma"

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

/** Pipeline reruns republish: the same fingerprint returns the row, another one conflicts. */
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
