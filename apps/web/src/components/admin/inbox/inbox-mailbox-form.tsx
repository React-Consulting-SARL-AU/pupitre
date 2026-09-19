import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import {
  type MailboxFormInput,
  type MailboxFormValues,
  mailboxSchema,
} from "@/lib/schemas/inbox"

export interface MailboxFlags {
  sensitive: boolean
  can_reply: boolean
  enabled: boolean
}

export interface InboxMailboxFormProps {
  id: string
  defaults: MailboxFormInput
  flags: MailboxFlags
  onFlagsChange: (flags: MailboxFlags) => void
  /** An address is chosen once: an open mailbox keeps the one the envelope carries. */
  addressLocked: boolean
  submitLabel: string
  pending: boolean
  onSubmit: (values: MailboxFormValues) => void
}

export function InboxMailboxForm({
  id,
  defaults,
  flags,
  onFlagsChange,
  addressLocked,
  submitLabel,
  pending,
  onSubmit,
}: InboxMailboxFormProps) {
  const t = useTranslations()
  const form = useForm<MailboxFormInput, MailboxFormValues>({
    schema: mailboxSchema(t),
    defaultValues: defaults,
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit((values) => {
    onSubmit(values)
  })

  return (
    <form
      className="flex flex-col gap-gutter"
      noValidate
      onSubmit={(event) => {
        submit(event)
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-address`}>{t("inbox.mailboxAddress")}</Label>
        <Input
          autoComplete="off"
          disabled={addressLocked}
          id={`${id}-address`}
          placeholder={t("inbox.mailboxAddressPlaceholder")}
          {...form.register("address")}
        />
        <FieldError>{errors.address?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>{t("inbox.mailboxName")}</Label>
        <Input
          autoComplete="off"
          id={`${id}-name`}
          {...form.register("display_name")}
        />
        <FieldError>{errors.display_name?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-signature`}>{t("inbox.mailboxSignature")}</Label>
        <Textarea
          className="min-h-20"
          id={`${id}-signature`}
          placeholder={t("inbox.mailboxSignaturePlaceholder")}
          {...form.register("signature")}
        />
        <FieldError>{errors.signature?.message}</FieldError>
      </div>

      <div className="flex flex-wrap gap-gutter">
        <Switch
          checked={flags.sensitive}
          id={`${id}-sensitive`}
          label={t("inbox.mailboxSensitive")}
          onCheckedChange={(sensitive) => {
            onFlagsChange({ ...flags, sensitive })
          }}
        />
        <Switch
          checked={flags.can_reply}
          id={`${id}-can-reply`}
          label={t("inbox.mailboxCanReply")}
          onCheckedChange={(can_reply) => {
            onFlagsChange({ ...flags, can_reply })
          }}
        />
        <Switch
          checked={flags.enabled}
          id={`${id}-enabled`}
          label={t("inbox.mailboxEnabled")}
          onCheckedChange={(enabled) => {
            onFlagsChange({ ...flags, enabled })
          }}
        />
      </div>

      <div className="flex justify-end">
        <Button icon={Save} loading={pending} type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
