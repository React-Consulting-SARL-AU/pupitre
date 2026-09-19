import { useEffect, useState } from "react"
import { InboxOrganizationFilter } from "@/components/admin/inbox/inbox-organization-filter"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from "@/hooks/use-locale"
import type {
  ThreadDirection,
  ThreadSort,
  ThreadStatus,
} from "@/lib/api/inbox-queries"
import {
  ASSIGNED_ANYONE,
  ASSIGNED_ME,
  ASSIGNED_NOBODY,
} from "@/lib/domain/inbox"
import type { InboxSearch } from "@/lib/domain/inbox-search"

const SEARCH_DELAY_MS = 300

export interface InboxFilterBarProps {
  search: InboxSearch
  organizationName: string | null
  onChange: (patch: Partial<InboxSearch>) => void
}

export function InboxFilterBar({
  search,
  organizationName,
  onChange,
}: InboxFilterBarProps) {
  const t = useTranslations()
  const [typed, setTyped] = useState(search.q)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typed !== search.q) {
        onChange({ q: typed })
      }
    }, SEARCH_DELAY_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [typed, search.q, onChange])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-status">{t("inbox.status")}</Label>
        <SegmentedControl
          onValueChange={(status: ThreadStatus) => {
            onChange({ status })
          }}
          options={[
            { value: "open", label: t("inbox.open") },
            { value: "closed", label: t("inbox.closed") },
          ]}
          value={search.status}
        />
      </div>

      <Switch
        checked={search.unread === true}
        id="inbox-unread-only"
        label={t("inbox.unreadOnly")}
        onCheckedChange={(unread) => {
          onChange({ unread: unread ? true : undefined })
        }}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-assigned">{t("inbox.assigned")}</Label>
        <SegmentedControl
          onValueChange={(assigned: string) => {
            onChange({ assigned })
          }}
          options={[
            { value: ASSIGNED_ANYONE, label: t("inbox.assignedAnyone") },
            { value: ASSIGNED_ME, label: t("inbox.assignedMe") },
            { value: ASSIGNED_NOBODY, label: t("inbox.assignedNobody") },
          ]}
          value={search.assigned}
        />
      </div>

      <InboxOrganizationFilter
        onOrganizationChange={(organization_id) => {
          onChange({ organization_id })
        }}
        organizationId={search.organization_id}
        organizationName={organizationName}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-sort">{t("inbox.sort")}</Label>
        <Select
          className="w-[200px]"
          id="inbox-sort"
          items={[
            { value: "last_activity", label: t("inbox.sortLastActivity") },
            { value: "last_inbound_at", label: t("inbox.sortLastInbound") },
            { value: "created_at", label: t("inbox.sortCreated") },
            { value: "subject", label: t("inbox.sortSubject") },
          ]}
          onValueChange={(sort) => {
            onChange({ sort: sort as ThreadSort })
          }}
          value={search.sort}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-direction">{t("inbox.direction")}</Label>
        <Select
          className="w-[200px]"
          id="inbox-direction"
          items={[
            { value: "desc", label: t("inbox.directionDesc") },
            { value: "asc", label: t("inbox.directionAsc") },
          ]}
          onValueChange={(direction) => {
            onChange({ direction: direction as ThreadDirection })
          }}
          value={search.direction}
        />
      </div>

      <div className="flex min-w-[220px] flex-1 flex-col gap-2 sm:max-w-[320px]">
        <Label htmlFor="inbox-search">{t("admin.search")}</Label>
        <Input
          autoComplete="off"
          id="inbox-search"
          onChange={(event) => {
            setTyped(event.target.value)
          }}
          placeholder={t("inbox.searchPlaceholder")}
          type="search"
          value={typed}
        />
      </div>
    </div>
  )
}
