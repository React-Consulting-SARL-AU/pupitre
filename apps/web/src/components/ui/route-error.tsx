import type { ErrorComponentProps } from "@tanstack/react-router"
import { Link, useRouter } from "@tanstack/react-router"
import { RotateCw, SearchX } from "lucide-react"
import { Button, buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { useTranslations } from "@/hooks/use-locale"
import { apiFailure } from "@/lib/api/errors"

export function RouteError({ error, reset }: ErrorComponentProps) {
  const t = useTranslations()
  const router = useRouter()
  const failure = apiFailure(error)

  return (
    <Callout
      action={
        <Button
          icon={RotateCw}
          onClick={() => {
            reset()
            router.invalidate()
          }}
          size="sm"
        >
          {t("common.retry")}
        </Button>
      }
      fix={failure?.fix ?? t("route.failedFix")}
      title={failure?.message ?? t("route.failed")}
      tone="danger"
    />
  )
}

export function RouteNotFound() {
  const t = useTranslations()

  return (
    <EmptyState
      action={
        <Link
          className={buttonClassName({ variant: "primary" })}
          to="/dashboard/servers"
        >
          {t("nav.backToConsole")}
        </Link>
      }
      description={t("route.notFoundDescription")}
      icon={SearchX}
      title={t("route.notFoundTitle")}
    />
  )
}
