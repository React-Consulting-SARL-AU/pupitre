import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/hooks/use-locale"
import {
  adminOrganizationQueryOptions,
  adminOrganizationsQueryOptions,
} from "@/lib/api/admin-queries"

const SUGGESTION_LIMIT = 6

const SEARCH_DELAY_MS = 300

export interface InboxOrganizationFilterProps {
  organizationId: string | undefined
  onOrganizationChange: (organizationId: string | undefined) => void
}

export function InboxOrganizationFilter({
  organizationId,
  onOrganizationChange,
}: InboxOrganizationFilterProps) {
  const t = useTranslations()
  const [typed, setTyped] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(typed.trim())
    }, SEARCH_DELAY_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [typed])

  const suggestions = useQuery({
    ...adminOrganizationsQueryOptions({
      limit: SUGGESTION_LIMIT,
      offset: 0,
      q: query,
    }),
    enabled: query.length > 1 && organizationId === undefined,
  })

  // The organisation the address names is read from the platform, not guessed
  // from the page: an empty page would otherwise show its raw identifier.
  const chosen = useQuery({
    ...adminOrganizationQueryOptions(organizationId ?? ""),
    enabled: organizationId !== undefined,
  })

  if (organizationId) {
    return (
      <div className="flex flex-col gap-2">
        <Label>{t("inbox.organization")}</Label>
        <Button
          icon={X}
          onClick={() => {
            setTyped("")
            onOrganizationChange(undefined)
          }}
          size="sm"
        >
          {chosen.data?.name ?? organizationId}
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-2">
      <Label htmlFor="inbox-organization">{t("inbox.organization")}</Label>
      <Input
        autoComplete="off"
        className="w-[220px]"
        id="inbox-organization"
        onChange={(event) => {
          setTyped(event.target.value)
        }}
        placeholder={t("inbox.organizationPlaceholder")}
        type="search"
        value={typed}
      />

      {suggestions.isSuccess && query.length > 1 ? (
        <ul className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-md bg-surface shadow-overlay">
          {suggestions.data.data.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-ink-3">
              {t("inbox.organizationNoMatch")}
            </li>
          ) : null}
          {suggestions.data.data.map((organization) => (
            <li key={organization.id}>
              <button
                className="w-full px-3 py-2 text-left text-[13px] text-ink-2 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2"
                onClick={() => {
                  setTyped("")
                  onOrganizationChange(organization.id)
                }}
                type="button"
              >
                {organization.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
