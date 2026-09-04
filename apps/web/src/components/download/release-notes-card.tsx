import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/utils/format"

export interface PublishedRelease {
  version: string
  notes: string
  published_at: string
}

export interface ReleaseNotesCardProps {
  release: PublishedRelease | null
}

function paragraphs(notes: string): string[] {
  return notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function ReleaseNotesCard({ release }: ReleaseNotesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes de version</CardTitle>
        {release ? (
          <span className="font-data text-[12px] text-ink-2 tabular-nums">
            {release.version} · {formatDateTime(release.published_at)}
          </span>
        ) : null}
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        {release ? (
          paragraphs(release.notes).map((line) => (
            <p className="text-[13px] text-ink-2" key={line}>
              {line}
            </p>
          ))
        ) : (
          <p className="text-[13px] text-ink-2">
            Aucune version n'a encore été publiée : il n'y a donc rien à
            raconter ici.
          </p>
        )}
      </CardBody>
    </Card>
  )
}
