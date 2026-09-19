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

/**
 * What the address becomes when a tab is picked, or nothing at all when it
 * already names that tab: a replacing navigation that changes nothing still
 * re-renders the page under the reader's hand, and swallows the click that
 * follows it.
 */
export function tabNavigation<Tab extends string>(
  current: Tab,
  next: Tab,
  fallback: Tab
): TabSearch<Tab> | null {
  if (next === current) {
    return null
  }

  return next === fallback ? {} : { tab: next }
}

export function useTabSearch<Tab extends string>(
  route: TabSearchRoute<Tab>,
  tabs: readonly Tab[]
): TabSearchHandle<Tab> {
  const search = route.useSearch()
  const navigate = useNavigate()
  const fallback = tabs[0]
  const current = search.tab ?? fallback
  const onTabChange = useCallback(
    (next: Tab) => {
      const wanted = tabNavigation(current, next, fallback)

      if (!wanted) {
        return
      }

      navigate({ to: ".", replace: true, search: (() => wanted) as never })
    },
    [navigate, fallback, current]
  )

  return { tab: current, onTabChange }
}
