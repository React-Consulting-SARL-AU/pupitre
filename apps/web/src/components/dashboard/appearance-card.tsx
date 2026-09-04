import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"

export function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apparence</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink">Thème</p>
            <p className="text-[13px] text-ink-2">
              Clair, sombre, ou celui de votre système. Le choix reste sur ce
              navigateur.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink">Langue</p>
            <p className="text-[13px] text-ink-2">
              La console est en français. L'anglais suivra la traduction du
              site.
            </p>
          </div>
          <span className="text-[13px] text-ink-3">Français</span>
        </div>
      </CardBody>
    </Card>
  )
}
