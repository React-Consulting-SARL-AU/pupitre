import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"

export interface AdminFailureProps {
  fetching: boolean
  onRetry: () => void
}

export function AdminFailure({ fetching, onRetry }: AdminFailureProps) {
  const t = useTranslations()

  return (
    <Callout
      action={
        <Button icon={RotateCw} loading={fetching} onClick={onRetry} size="sm">
          {t("common.retry")}
        </Button>
      }
      fix={t("admin.failedFix")}
      title={t("admin.failed")}
      tone="danger"
    />
  )
}
