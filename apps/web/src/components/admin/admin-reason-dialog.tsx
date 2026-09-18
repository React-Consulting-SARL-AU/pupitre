import { AlertDialog } from "@base-ui-components/react/alert-dialog"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"
import {
  type ReasonInput,
  type ReasonValues,
  reasonSchema,
} from "@/lib/schemas/admin"

export interface AdminReasonDialogProps {
  /** The field the tests and the label point at; unique on a page that carries several. */
  fieldId: string
  triggerLabel: string
  triggerIcon?: LucideIcon
  title: string
  description: string
  fieldLabel: string
  requiredMessage: string
  tooLongMessage: string
  confirmLabel: string
  busy: boolean
  busyLabel: string
  disabled?: boolean
  onConfirm: (reason: string) => void
}

/** The confirmation that asks for the reason the person on the other side will read. */
export function AdminReasonDialog({
  fieldId,
  triggerLabel,
  triggerIcon: TriggerIcon,
  title,
  description,
  fieldLabel,
  requiredMessage,
  tooLongMessage,
  confirmLabel,
  busy,
  busyLabel,
  disabled = false,
  onConfirm,
}: AdminReasonDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const form = useForm<ReasonInput, ReasonValues>({
    schema: reasonSchema({
      required: requiredMessage,
      tooLong: tooLongMessage,
    }),
    defaultValues: { reason: "" },
  })

  const submit = form.handleSubmit((values) => {
    setOpen(false)
    form.reset({ reason: "" })
    onConfirm(values.reason)
  })

  return (
    <AlertDialog.Root onOpenChange={setOpen} open={open}>
      <AlertDialog.Trigger
        render={
          <Button
            disabled={disabled}
            icon={TriggerIcon}
            loading={busy}
            size="sm"
            variant="danger"
          >
            {busy ? busyLabel : triggerLabel}
          </Button>
        }
      />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none">
          <AlertDialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[13px] text-ink-2">
            {description}
          </AlertDialog.Description>

          <form
            className="mt-gutter flex flex-col gap-2"
            noValidate
            onSubmit={(event) => {
              submit(event)
            }}
          >
            <Label htmlFor={fieldId}>{fieldLabel}</Label>
            <Input
              autoComplete="off"
              id={fieldId}
              maxLength={MAX_REASON_LENGTH}
              {...form.register("reason")}
            />
            <FieldError>{form.formState.errors.reason?.message}</FieldError>

            <div className="mt-4 flex justify-end gap-2">
              <AlertDialog.Close
                render={<Button variant="ghost">{t("common.cancel")}</Button>}
              />
              <Button type="submit" variant="danger">
                {confirmLabel}
              </Button>
            </div>
          </form>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
