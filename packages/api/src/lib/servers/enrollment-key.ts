const ENROLLMENT_KEY_FIELD = "enrollmentKey"

interface UniqueViolation {
  code?: unknown
  meta?: {
    target?: unknown
    driverAdapterError?: {
      cause?: { constraint?: { index?: unknown; fields?: unknown } }
    }
  }
}

export interface EnrollmentTarget {
  organizationId: string
  host: string
  port: number
}

export const RELEASED_ENROLLMENT = {
  enrollmentKey: null,
  enrollmentTokenHash: null,
  enrollmentExpiresAt: null,
} as const

/** A seat is a machine, not the laptop that enrolled it: one key per host and port of the organization. */
export function enrollmentKeyOf({
  organizationId,
  host,
  port,
}: EnrollmentTarget): string {
  return `${organizationId}:${host}:${port}`
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase()
}

export function isEnrollmentKeyConflict(error: unknown): boolean {
  if (!(error && typeof error === "object")) {
    return false
  }

  const { code, meta } = error as UniqueViolation

  if (code !== "P2002") {
    return false
  }

  // Prisma names the violated constraint in `meta.target` on some adapters, under `driverAdapterError` on others.
  const constraint = meta?.driverAdapterError?.cause?.constraint

  return [meta?.target, constraint?.index, constraint?.fields]
    .flatMap((named) => (Array.isArray(named) ? named : [named]))
    .some((named) => String(named).includes(ENROLLMENT_KEY_FIELD))
}
