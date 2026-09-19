import { Dialog } from "@base-ui-components/react/dialog"
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
  /** Unique on a page that carries several: the fields and the labels hang off it. */
  id: string
  /** Left out when the dialog is opened from elsewhere: a row menu item carries no button. */
  triggerLabel?: string
  triggerIcon?: LucideIcon
  /** A row has no room for a sentence: the icon carries the action, the word names it. */
  triggerIconOnly?: boolean
  triggerDisabled?: boolean
  title: string
  /** What happens once the button is pressed, in one sentence. */
  description: string
  reason?: ReasonRule
  reasonLabel?: string
  /** Why the reason is asked for, in the words of the gesture. */
  reasonRequiredMessage?: string
  /** What has to be retyped before the button comes alive; compared without case. */
  keyword?: string
  keywordLabel?: string
  /** An instant the action holds until, asked as a local date and time. */
  until?: boolean
  untilLabel?: string
  confirmLabel: string
  /** Given while the work runs: the dialog then closes when it ends without a refusal. */
  busy?: boolean
  busyLabel?: string
  tone?: ConfirmTone
  /** The server's refusal, shown inside the dialog, which stays open with the typing intact. */
  refusal?: ConfirmRefusal | null
  /** Given when the gesture is offered somewhere a trigger cannot live, such as a row menu that closes on select; the dialog then carries no trigger of its own. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onConfirm: (values: ConfirmFormValues) => void
  children?: ReactNode
}

const TRIGGER_VARIANTS: Record<ConfirmTone, ButtonVariant> = {
  danger: "danger",
  warning: "secondary",
}

const EMPTY: ConfirmFormInput = { reason: "", keyword: "", until: "" }

/** A confirmation the reader has to mean: a reason, a word to retype, a deadline. */
export function ConfirmFormDialog({
  id,
  triggerLabel,
  triggerIcon: TriggerIcon,
  triggerIconOnly = false,
  triggerDisabled = false,
  title,
  description,
  reason = "optional",
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
  open,
  onOpenChange,
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
    <Dialog.Root
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          form.reset(EMPTY)
        }
      }}
      open={shown}
    >
      {driven || triggerLabel === undefined ? null : (
        <Dialog.Trigger
          render={
            <Button
              aria-label={triggerIconOnly ? triggerLabel : undefined}
              className={triggerIconOnly ? "w-7 px-0" : undefined}
              disabled={triggerDisabled}
              icon={TriggerIcon}
              size="sm"
              title={triggerIconOnly ? triggerLabel : undefined}
              variant={TRIGGER_VARIANTS[tone]}
            >
              {triggerIconOnly ? null : triggerLabel}
            </Button>
          }
        />
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none">
          <Dialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] text-ink-2">
            {description}
          </Dialog.Description>

          <form
            className="mt-gutter flex flex-col gap-gutter"
            noValidate
            onSubmit={(event) => {
              submit(event)
            }}
          >
            {children}

            {reason === "required" || reasonLabel ? (
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
                <FieldError>
                  {form.formState.errors.keyword?.message}
                </FieldError>
              </div>
            )}

            {refusal ? (
              <Callout
                fix={refusal.fix}
                title={refusal.message}
                tone="danger"
              />
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
