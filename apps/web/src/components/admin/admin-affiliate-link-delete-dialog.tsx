import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { deleteAffiliateLink } from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"

export interface AdminAffiliateLinkDeleteTarget {
  id: string
  name: string
  code: string
}

export interface AdminAffiliateLinkDeleteDialogProps {
  link: AdminAffiliateLinkDeleteTarget
  /** Held outside when a row menu opens it; left out, the dialog carries its own button. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onDeleted?: () => void
}

export function AdminAffiliateLinkDeleteDialog({
  link,
  open,
  onOpenChange,
  onDeleted,
}: AdminAffiliateLinkDeleteDialogProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const held = open !== undefined
  const remove = useMutation({
    mutationFn: () => deleteAffiliateLink(link.id),
    onSuccess: async () => {
      toasts.done(t("admin.links.deleted", { name: link.name }))
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.affiliateLinks,
      })
      onDeleted?.()
    },
  })
  const said = remove.isError ? apiFailure(remove.error) : null
  const refusal = remove.isError
    ? {
        message: said?.message ?? t("admin.links.deleteFailed"),
        fix: said?.fix ?? t("common.retryLater"),
      }
    : null

  return (
    <ConfirmFormDialog
      busy={remove.isPending}
      busyLabel={t("admin.links.deleting")}
      confirmLabel={t("admin.links.delete")}
      description={t("admin.links.deleteDescription", { name: link.name })}
      id={`delete-link-${link.id}`}
      keyword={link.code}
      onConfirm={() => {
        remove.mutate()
      }}
      onOpenChange={(next) => {
        remove.reset()
        onOpenChange?.(next)
      }}
      open={open}
      refusal={refusal}
      title={t("admin.links.deleteTitle")}
      triggerIcon={held ? undefined : Trash2}
      triggerLabel={held ? undefined : t("admin.links.delete")}
    />
  )
}
