import { type ReactNode, useState } from "react"
import { nextListSearch } from "@/lib/domain/list-search"

export interface ListSearchHarnessProps<Search extends { offset?: number }> {
  initial?: Search
  children: (handle: {
    search: Search
    setSearch: (patch: Partial<Search>) => void
  }) => ReactNode
}

/** The address a list reads, held in memory: a component test has no router state. */
export function ListSearchHarness<Search extends { offset?: number }>({
  initial,
  children,
}: ListSearchHarnessProps<Search>) {
  const [search, setSearch] = useState<Search>(initial ?? ({} as Search))

  return children({
    search,
    setSearch: (patch) => {
      setSearch((previous) => nextListSearch(previous, patch))
    },
  })
}
