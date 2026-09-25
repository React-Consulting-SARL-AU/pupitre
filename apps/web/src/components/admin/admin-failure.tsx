import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { apiFailure } from "@/lib/api/errors"

export interface AdminFailureProps {
  fetching: boolean
  onRetry: () => void
  error?: unknown
}

export function AdminFailure({ fetching, onRetry, error }: AdminFailureProps) {
  const t = useTranslations()
  const refused = apiFailure(error)

  return (
    <Callout
      action={
        <Button icon={RotateCw} loading={fetching} onClick={onRetry} size="sm">
          {t("common.retry")}
        </Button>
      }
      fix={refused?.fix ?? t("common.retryLater")}
      title={refused?.message ?? t("admin.failed")}
      tone="danger"
    />
  )
}
