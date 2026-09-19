import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { z } from "zod"

export type SortDirection = "asc" | "desc"

/** What a filter select holds while it narrows nothing; the address carries no key at all. */
export const FILTER_ALL = ""

/** A sort the page does not declare is a sort it does not run. */
export function listSort<Sort extends string>(
  value: string | undefined,
  sorts: readonly Sort[],
  fallback: Sort
): Sort {
  return sorts.find((sort) => sort === value) ?? fallback
}

/** The three values a select holds for a flag the address carries as a word. */
export function flagValue(flag: boolean | undefined): string {
  if (flag === undefined) {
    return FILTER_ALL
  }

  return flag ? "true" : "false"
}

export function readFlag(value: string): boolean | undefined {
  if (value === FILTER_ALL) {
    return undefined
  }

  return value === "true"
}

export type ListFilter =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "enum"; values: readonly string[] }

export type ListFilters = Record<string, ListFilter>

type FilterValue<F extends ListFilter> = F extends { kind: "boolean" }
  ? boolean
  : F extends { kind: "enum"; values: readonly (infer V)[] }
    ? V
    : string

export type ListSearch<Filters extends ListFilters = Record<never, never>> = {
  q?: string
  offset?: number
  sort?: string
  direction?: SortDirection
} & { [Key in keyof Filters]?: FilterValue<Filters[Key]> }

export interface ListSearchOptions<Filters extends ListFilters> {
  /** The columns a header may sort on; anything else in the address is dropped. */
  sortKeys?: readonly string[]
  defaultSort?: string
  defaultDirection?: SortDirection
  filters?: Filters
}

const queryField = z.string().trim().max(254)

const offsetField = z.coerce.number().int().min(0)

const directionField = z.enum(["asc", "desc"])

/**
 * The router parses `?stale=true` into a boolean before the schema sees it, and
 * a link written by hand carries the word: both forms have to land.
 */
const booleanField = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
])

function filterSchema(filter: ListFilter): z.ZodType {
  if (filter.kind === "boolean") {
    return booleanField
  }

  if (filter.kind === "enum") {
    return z.enum([...filter.values] as [string, ...string[]])
  }

  return z.string().trim().max(254)
}

function kept<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value)

  return parsed.success ? parsed.data : undefined
}

/**
 * The address carries what the reader chose and nothing else: a value equal to
 * the default leaves the URL, so a shared link never freezes today's defaults.
 */
export function listSearch<Filters extends ListFilters>({
  sortKeys = [],
  defaultSort,
  defaultDirection = "desc",
  filters = {} as Filters,
}: ListSearchOptions<Filters> = {}) {
  const sortField = sortKeys.length > 0 ? z.enum([...sortKeys]) : null

  return (raw: Record<string, unknown>): ListSearch<Filters> => {
    const search: Record<string, unknown> = {}
    const q = kept(queryField, raw.q)
    const offset = kept(offsetField, raw.offset)
    const sort = sortField ? kept(sortField, raw.sort) : undefined
    const direction = kept(directionField, raw.direction)

    if (q !== undefined && q !== "") {
      search.q = q
    }

    if (offset !== undefined && offset > 0) {
      search.offset = offset
    }

    if (sort !== undefined && sort !== defaultSort) {
      search.sort = sort
    }

    if (direction !== undefined && direction !== defaultDirection) {
      search.direction = direction
    }

    for (const [name, filter] of Object.entries(filters)) {
      const value = kept(filterSchema(filter), raw[name])

      if (value !== undefined && value !== "") {
        search[name] = value
      }
    }

    return search as ListSearch<Filters>
  }
}

export interface ListSearchHandle<Search> {
  search: Search
  setSearch: (patch: Partial<Search>) => void
}

export interface SearchRoute<Search> {
  useSearch: () => Search
}

/** Anything but a page turn lands the reader back on the first page. */
export function nextListSearch<Search extends { offset?: number }>(
  search: Search,
  patch: Partial<Search>
): Search {
  const turnsPage = Object.keys(patch).every((key) => key === "offset")

  return {
    ...search,
    ...(turnsPage ? {} : { offset: undefined }),
    ...patch,
  } as Search
}

export function useListSearch<Search extends { offset?: number }>(
  route: SearchRoute<Search>
): ListSearchHandle<Search> {
  const search = route.useSearch()
  const navigate = useNavigate()
  const setSearch = useCallback(
    (patch: Partial<Search>) => {
      navigate({
        to: ".",
        replace: true,
        // The hook serves every list, so the router cannot resolve one search
        // shape here; the route's own `validateSearch` types and cleans it.
        search: ((previous: Search) =>
          nextListSearch(previous, patch)) as never,
      })
    },
    [navigate]
  )

  return { search, setSearch }
}
