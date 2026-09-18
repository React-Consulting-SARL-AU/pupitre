import { AdminSearchForm } from "@/components/admin/admin-search-form"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from "@/hooks/use-locale"
import type { ThreadStatus } from "@/lib/api/inbox-queries"
import {
  ASSIGNED_ANYONE,
  ASSIGNED_ME,
  ASSIGNED_NOBODY,
} from "@/lib/domain/inbox"

export interface InboxFilterBarProps {
  status: ThreadStatus
  onStatusChange: (status: ThreadStatus) => void
  unreadOnly: boolean
  onUnreadOnlyChange: (unreadOnly: boolean) => void
  assigned: string
  onAssignedChange: (assigned: string) => void
  address: string
  onAddressChange: (address: string) => void
  addresses: string[]
  query: string
  onSearch: (query: string) => void
}

const EVERY_ADDRESS = ""

export function InboxFilterBar({
  status,
  onStatusChange,
  unreadOnly,
  onUnreadOnlyChange,
  assigned,
  onAssignedChange,
  address,
  onAddressChange,
  addresses,
  query,
  onSearch,
}: InboxFilterBarProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-wrap items-end gap-gutter">
      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-status">{t("inbox.status")}</Label>
        <SegmentedControl
          onValueChange={onStatusChange}
          options={[
            { value: "open", label: t("inbox.open") },
            { value: "closed", label: t("inbox.closed") },
          ]}
          value={status}
        />
      </div>

      <Switch
        checked={unreadOnly}
        id="inbox-unread-only"
        label={t("inbox.unreadOnly")}
        onCheckedChange={onUnreadOnlyChange}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-assigned">{t("inbox.assigned")}</Label>
        <SegmentedControl
          onValueChange={onAssignedChange}
          options={[
            { value: ASSIGNED_ANYONE, label: t("inbox.assignedAnyone") },
            { value: ASSIGNED_ME, label: t("inbox.assignedMe") },
            { value: ASSIGNED_NOBODY, label: t("inbox.assignedNobody") },
          ]}
          value={assigned}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-address">{t("inbox.address")}</Label>
        <Select
          className="w-[240px]"
          id="inbox-address"
          items={[
            { value: EVERY_ADDRESS, label: t("inbox.everyAddress") },
            ...addresses.map((candidate) => ({
              value: candidate,
              label: candidate,
            })),
          ]}
          onValueChange={onAddressChange}
          value={address}
        />
      </div>

      <AdminSearchForm
        id="inbox-search"
        onSearch={onSearch}
        placeholder={t("inbox.searchPlaceholder")}
        query={query}
      />
    </div>
  )
}
