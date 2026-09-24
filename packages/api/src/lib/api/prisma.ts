import { Prisma, type PrismaClient } from "@pupitre/db/cloudflare/client"
import { scopedPrismaClient } from "@pupitre/db/scope"

export type ApiPrisma = PrismaClient

let configured: ApiPrisma | null = null

export function configurePrisma(client: ApiPrisma): void {
  configured = client
}

/** The test's client when one is configured; otherwise the request's, set by the Worker. */
export function getPrisma(): ApiPrisma {
  return configured ?? scopedPrismaClient()
}

const UNIQUE_VIOLATION = "P2002"

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  )
}

export type Serialized<T> = T extends Date | bigint | Prisma.Decimal
  ? string
  : T extends (infer Item)[]
    ? Serialized<Item>[]
    : T extends object
      ? { [Key in keyof T]: Serialized<T[Key]> }
      : T

function walk(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === "bigint" || Prisma.Decimal.isDecimal(value)) {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map(walk)
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, walk(entry)])
    )
  }

  return value
}

export function serializeData<T>(value: T): Serialized<T> {
  return walk(value) as Serialized<T>
}

const ORGANIZATION_SCOPED_MODELS = new Set<string>([
  "Member",
  "Invitation",
  "Server",
  "Backup",
  "Subscription",
  "OrganizationBilling",
  "Event",
])

const CREATE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
])

const ORGANIZATION_FIELD = "organizationId"

type Args = Record<string, unknown>

export class OrganizationScopeViolationError extends Error {
  readonly model: string
  readonly operation: string

  constructor(model: string, operation: string) {
    super(`${model}.${operation} reaches outside the request's organization`)
    this.name = "OrganizationScopeViolationError"
    this.model = model
    this.operation = operation
  }
}

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function scopeRecord(
  record: unknown,
  organizationId: string,
  violation: () => OrganizationScopeViolationError
): Args {
  const scoped = isRecord(record) ? record : {}
  const pinned = scoped[ORGANIZATION_FIELD]

  if (
    "organization" in scoped ||
    (pinned !== undefined && pinned !== organizationId)
  ) {
    throw violation()
  }

  return { ...scoped, [ORGANIZATION_FIELD]: organizationId }
}

function scopeArgs(
  model: string,
  operation: string,
  args: Args,
  organizationId: string
): Args {
  const violation = () => new OrganizationScopeViolationError(model, operation)

  if (CREATE_OPERATIONS.has(operation)) {
    const { data } = args
    const scopedData = Array.isArray(data)
      ? data.map((row) => scopeRecord(row, organizationId, violation))
      : scopeRecord(data, organizationId, violation)

    return { ...args, data: scopedData }
  }

  const scoped: Args = {
    ...args,
    where: scopeRecord(args.where, organizationId, violation),
  }

  if (operation === "upsert") {
    scoped.create = scopeRecord(args.create, organizationId, violation)
  }

  return scoped
}

export function withOrganization(prisma: ApiPrisma, organizationId: string) {
  return prisma.$extends({
    name: "withOrganization",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!ORGANIZATION_SCOPED_MODELS.has(model)) {
            return query(args)
          }

          const scoped = scopeArgs(
            model,
            operation,
            (args ?? {}) as Args,
            organizationId
          )

          return query(scoped as typeof args)
        },
      },
    },
  })
}

export type OrganizationPrisma = ReturnType<typeof withOrganization>
