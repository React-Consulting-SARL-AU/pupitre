import type { LucideIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Button, type ButtonVariant } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import {
  DialogClose,
  DialogPopup,
  DialogRoot,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"
import {
  type ConfirmFormInput,
  type ConfirmFormValues,
  confirmFormSchema,
} from "@/lib/schemas/confirm-form"

export type ConfirmTone = "danger" | "warning"

export type ReasonRule = "optional" | "required"

export interface ConfirmRefusal {
  message: string
  fix?: string | null
}

export interface ConfirmFormDialogProps {
  id: string
  triggerLabel?: string
  triggerIcon?: LucideIcon
  triggerIconOnly?: boolean
  triggerDisabled?: boolean
  triggerTitle?: string
  // Controlled from a row menu: the dialog then renders no trigger of its own.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  reason?: ReasonRule
  reasonLabel?: string
  reasonRequiredMessage?: string
  // Compared case-insensitively.
  keyword?: string
  keywordLabel?: string
  until?: boolean
  untilLabel?: string
  confirmLabel: string
  // The dialog closes once busy ends without a refusal.
  busy?: boolean
  busyLabel?: string
  tone?: ConfirmTone
  refusal?: ConfirmRefusal | null
  onConfirm: (values: ConfirmFormValues) => void
  children?: ReactNode
}

const TRIGGER_VARIANTS: Record<ConfirmTone, ButtonVariant> = {
  danger: "danger",
  warning: "secondary",
}

const EMPTY: ConfirmFormInput = { reason: "", keyword: "", until: "" }

export function ConfirmFormDialog({
  id,
  triggerLabel,
  triggerIcon: TriggerIcon,
  triggerIconOnly = false,
  triggerDisabled = false,
  triggerTitle,
  open,
  onOpenChange,
  title,
  description,
  reason,
  reasonLabel,
  reasonRequiredMessage,
  keyword,
  keywordLabel,
  until = false,
  untilLabel,
  confirmLabel,
  busy,
  busyLabel,
  tone = "danger",
  refusal = null,
  onConfirm,
  children,
}: ConfirmFormDialogProps) {
  const t = useTranslations()
  const [openHere, setOpenHere] = useState(false)
  const driven = open !== undefined
  const shown = driven ? open : openHere
  const setOpen = useCallback(
    (next: boolean) => {
      if (!driven) {
        setOpenHere(next)
      }

      onOpenChange?.(next)
    },
    [driven, onOpenChange]
  )
  const form = useForm<ConfirmFormInput, ConfirmFormValues>({
    schema: confirmFormSchema(t, {
      reason,
      reasonRequiredMessage,
      keyword,
      until,
    }),
    defaultValues: EMPTY,
  })
  const typedKeyword = form.watch("keyword") ?? ""
  const locked =
    keyword !== undefined &&
    typedKeyword.trim().toLowerCase() !== keyword.toLowerCase()
  const working = useRef(false)

  useEffect(() => {
    if (busy) {
      working.current = true

      return
    }

    if (working.current) {
      working.current = false

      if (!refusal) {
        setOpen(false)
        form.reset(EMPTY)
      }
    }
  }, [busy, refusal, form, setOpen])

  const submit = form.handleSubmit((values) => {
    onConfirm(values)

    if (busy === undefined) {
      setOpen(false)
      form.reset(EMPTY)
    }
  })

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      submit(event)
    }
  }

  return (
    <DialogRoot
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          form.reset(EMPTY)
        }
      }}
      open={shown}
    >
      {driven || triggerLabel === undefined ? null : (
        <DialogTrigger
          render={
            <Button
              aria-label={triggerIconOnly ? triggerLabel : undefined}
              className={triggerIconOnly ? "w-7 px-0" : undefined}
              disabled={triggerDisabled}
              icon={TriggerIcon}
              size="sm"
              title={
                triggerTitle ?? (triggerIconOnly ? triggerLabel : undefined)
              }
              variant={TRIGGER_VARIANTS[tone]}
            >
              {triggerIconOnly ? null : triggerLabel}
            </Button>
          }
        />
      )}
      <DialogPopup description={description} size="sm" title={title}>
        <form
          className="mt-gutter flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          {children}

          {reason ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-reason`}>
                {reasonLabel ?? t("confirm.reason")}
              </Label>
              <Input
                autoComplete="off"
                id={`${id}-reason`}
                maxLength={MAX_REASON_LENGTH}
                onKeyDown={onFieldKeyDown}
                {...form.register("reason")}
              />
              <FieldError>{form.formState.errors.reason?.message}</FieldError>
            </div>
          ) : null}

          {until ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-until`}>
                {untilLabel ?? t("confirm.until")}
              </Label>
              <Input
                className="w-56 font-data tabular-nums"
                id={`${id}-until`}
                onKeyDown={onFieldKeyDown}
                type="datetime-local"
                {...form.register("until")}
              />
              <FieldError>{form.formState.errors.until?.message}</FieldError>
            </div>
          ) : null}

          {keyword === undefined ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-keyword`}>
                {keywordLabel ?? t("confirm.keyword", { keyword })}
              </Label>
              <Input
                autoComplete="off"
                id={`${id}-keyword`}
                onKeyDown={onFieldKeyDown}
                {...form.register("keyword")}
              />
              <FieldError>{form.formState.errors.keyword?.message}</FieldError>
            </div>
          )}

          {refusal ? (
            <Callout fix={refusal.fix} title={refusal.message} tone="danger" />
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose
              render={<Button variant="ghost">{t("common.cancel")}</Button>}
            />
            <Button
              disabled={locked}
              loading={busy}
              type="submit"
              variant={tone === "danger" ? "danger" : "primary"}
            >
              {busy && busyLabel ? busyLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </DialogRoot>
  )
}
