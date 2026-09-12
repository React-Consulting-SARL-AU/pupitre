import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { Markdown } from "@/components/ui/markdown"
import { useTranslations } from "@/hooks/use-locale"
import { formatDateTime } from "@/lib/utils/format"

export interface PublishedRelease {
  version: string
  channel: string
  notes: string
  published_at: string
}

export interface ReleaseNotesCardProps {
  release: PublishedRelease | null
}

export function ReleaseNotesCard({ release }: ReleaseNotesCardProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("releases.notes.title")}</CardTitle>
        {release ? (
          <span className="flex items-center gap-2 font-data text-[12px] text-ink-2 tabular-nums">
            {release.version} · {formatDateTime(release.published_at, t)}
            {release.channel === "stable" ? null : (
              <span className="rounded-full bg-raised px-2 py-[2px] text-[10.5px] uppercase tracking-[0.08em]">
                {release.channel}
              </span>
            )}
          </span>
        ) : null}
      </CardHeader>
      <CardBody>
        {release ? (
          <Markdown source={release.notes} />
        ) : (
          <p className="text-[13px] text-ink-2">{t("releases.notes.empty")}</p>
        )}
      </CardBody>
    </Card>
  )
}
