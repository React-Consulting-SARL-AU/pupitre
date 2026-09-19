import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Unlink } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/hooks/use-locale"
import { adminOrganizationsQueryOptions } from "@/lib/api/admin-queries"

const SUGGESTION_LIMIT = 6

const SEARCH_DELAY_MS = 300

export interface InboxOrganizationLinkProps {
  organization: { id: string; name: string; slug: string } | null
  canAct: boolean
  onLink: (organizationId: string | null) => void
  pending: boolean
}

export function InboxOrganizationLink({
  organization,
  canAct,
  onLink,
  pending,
}: InboxOrganizationLinkProps) {
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
    enabled: canAct && organization === null && query.length > 1,
  })

  if (organization) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="text-[13px] text-ink-2 underline transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          params={{ id: organization.id }}
          to="/dashboard/admin/organizations/$id"
        >
          {t("inbox.openOrganization", { name: organization.name })}
        </Link>
        {canAct ? (
          <Button
            aria-label={t("inbox.unlinkOrganization")}
            className="w-7 px-0"
            icon={Unlink}
            loading={pending}
            onClick={() => {
              onLink(null)
            }}
            size="sm"
            title={t("inbox.unlinkOrganization")}
            variant="ghost"
          />
        ) : null}
      </div>
    )
  }

  if (!canAct) {
    return null
  }

  return (
    <div className="relative flex flex-col gap-2">
      <Label htmlFor="inbox-thread-organization">
        {t("inbox.linkOrganization")}
      </Label>
      <Input
        autoComplete="off"
        id="inbox-thread-organization"
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
          {suggestions.data.data.map((candidate) => (
            <li key={candidate.id}>
              <button
                className="w-full px-3 py-2 text-left text-[13px] text-ink-2 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2"
                onClick={() => {
                  setTyped("")
                  onLink(candidate.id)
                }}
                type="button"
              >
                {candidate.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
