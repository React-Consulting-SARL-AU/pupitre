import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { z } from "zod"

export interface TabSearch<Tab extends string> {
  tab?: Tab
}

/**
 * The tab the reader opened lives in the address, so a reload and a shared link
 * land on it; the first tab is the default and leaves the address empty.
 */
export function tabSearch<Tab extends string>(
  tabs: readonly Tab[]
): (raw: Record<string, unknown>) => TabSearch<Tab> {
  const field = z.enum([...tabs] as unknown as [string, ...string[]])

  return (raw) => {
    const parsed = field.safeParse(raw.tab)

    return parsed.success && parsed.data !== tabs[0]
      ? { tab: parsed.data as Tab }
      : {}
  }
}

export interface TabSearchRoute<Tab extends string> {
  useSearch: () => TabSearch<Tab>
}

export interface TabSearchHandle<Tab extends string> {
  tab: Tab
  onTabChange: (tab: Tab) => void
}

export function useTabSearch<Tab extends string>(
  route: TabSearchRoute<Tab>,
  tabs: readonly Tab[]
): TabSearchHandle<Tab> {
  const search = route.useSearch()
  const navigate = useNavigate()
  const fallback = tabs[0]
  const onTabChange = useCallback(
    (next: Tab) => {
      navigate({
        to: ".",
        replace: true,
        search: (() => (next === fallback ? {} : { tab: next })) as never,
      })
    },
    [navigate, fallback]
  )

  return { tab: search.tab ?? fallback, onTabChange }
}
