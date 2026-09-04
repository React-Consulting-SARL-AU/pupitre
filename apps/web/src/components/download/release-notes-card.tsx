import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"

export interface ReleaseNotesCardProps {
  version: string | null
}

export function ReleaseNotesCard({ version }: ReleaseNotesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes de version</CardTitle>
        {version ? (
          <span className="font-data text-[12px] text-ink-2 tabular-nums">
            {version}
          </span>
        ) : null}
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        {version ? (
          <>
            <p className="text-[13px] text-ink-2">
              L'app et l'agent sortent sur la même version : l'app installe
              l'agent qu'elle sait piloter.
            </p>
            <p className="text-[13px] text-ink-3">
              Le détail des changements est publié dans le changelog du site à
              chaque version.
            </p>
          </>
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
