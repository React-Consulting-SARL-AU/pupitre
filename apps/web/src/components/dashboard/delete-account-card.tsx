import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { DangerZone } from "@/components/ui/danger-zone"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"

export function DeleteAccountCard() {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const removal = useRequestCycle()

  function remove() {
    return removal.run(async () => {
      const { error } = await authClient().deleteUser({})

      if (error) {
        throw new Error(error.message ?? t("deleteAccount.failed"))
      }

      queryClient.clear()
      await navigate({ to: "/auth/sign-in" })
    })
  }

  return (
    <DangerZone
      action={
        <ConfirmFormDialog
          busy={removal.phase === "pending"}
          busyLabel={t("deleteAccount.pending")}
          confirmLabel={t("deleteAccount.confirm")}
          description={t("deleteAccount.subscription")}
          id="delete-account"
          keyword={user.email}
          onConfirm={() => {
            remove()
          }}
          onOpenChange={(open) => {
            if (!open) {
              removal.reset()
            }
          }}
          refusal={
            removal.error
              ? { message: removal.error, fix: t("deleteAccount.failedFix") }
              : null
          }
          title={t("deleteAccount.dialogTitle")}
          triggerIcon={Trash2}
          triggerLabel={t("deleteAccount.trigger")}
        />
      }
      description={t("deleteAccount.lead")}
      title={t("deleteAccount.title")}
    />
  )
}
