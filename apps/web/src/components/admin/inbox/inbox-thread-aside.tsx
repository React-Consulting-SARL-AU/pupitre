import { Link } from "@tanstack/react-router"
import { InboxActivityList } from "@/components/admin/inbox/inbox-activity-list"
import { InboxNotesPanel } from "@/components/admin/inbox/inbox-notes-panel"
import { InboxOrganizationLink } from "@/components/admin/inbox/inbox-organization-link"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxActivity, InboxNote } from "@/lib/api/inbox-queries"
import { formatDateTime } from "@/lib/utils/format"

export interface InboxThreadAsideProps {
  threadId: string
  address: string
  mailboxName: string | null
  assignedName: string | null
  contact: { user_id: string; email: string; name: string } | null
  organization: { id: string; name: string; slug: string } | null
  createdAt: string
  lastInboundAt: string | null
  lastOutboundAt: string | null
  notes: InboxNote[]
  activities: InboxActivity[]
  canAct: boolean
  linkPending: boolean
  onLink: (organizationId: string | null) => void
}

export function InboxThreadAside({
  threadId,
  address,
  mailboxName,
  assignedName,
  contact,
  organization,
  createdAt,
  lastInboundAt,
  lastOutboundAt,
  notes,
  activities,
  canAct,
  linkPending,
  onLink,
}: InboxThreadAsideProps) {
  const t = useTranslations()
  const facts: { label: string; value: string }[] = [
    { label: t("inbox.mailboxPick"), value: mailboxName ?? address },
    { label: t("inbox.address"), value: address },
    {
      label: t("inbox.assignee"),
      value: assignedName ?? t("inbox.unassigned"),
    },
    { label: t("inbox.openedAt"), value: formatDateTime(createdAt, t) },
    {
      label: t("inbox.lastInbound"),
      value: lastInboundAt
        ? formatDateTime(lastInboundAt, t)
        : t("format.none"),
    },
    {
      label: t("inbox.lastOutbound"),
      value: lastOutboundAt
        ? formatDateTime(lastOutboundAt, t)
        : t("format.none"),
    },
  ]

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("inbox.details")}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2">
            {facts.map((fact) => (
              <div className="flex flex-col gap-0.5" key={fact.label}>
                <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                  {fact.label}
                </dt>
                <dd className="break-words text-[13px] text-ink-2">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {contact?.user_id ? (
            <Link
              className="text-[13px] text-ink-2 underline transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
              params={{ id: contact.user_id }}
              to="/dashboard/admin/users/$id"
            >
              {t("inbox.openContact", {
                name: contact.name || contact.email,
              })}
            </Link>
          ) : null}

          <div className="flex flex-col gap-1">
            <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {t("inbox.linkedOrganization")}
            </p>
            <InboxOrganizationLink
              canAct={canAct}
              onLink={onLink}
              organization={organization}
              pending={linkPending}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("inbox.notes")}</CardTitle>
        </CardHeader>
        <CardBody>
          <InboxNotesPanel notes={notes} threadId={threadId} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("inbox.activity")}</CardTitle>
        </CardHeader>
        <CardBody>
          <InboxActivityList activities={activities} />
        </CardBody>
      </Card>
    </div>
  )
}
