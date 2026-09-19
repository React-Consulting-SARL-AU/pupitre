import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { apiFailure } from "@/lib/api/errors"
import {
  createTemplate,
  deleteTemplate,
  type InboxMailbox,
  inboxKeys,
  inboxTemplatesQueryOptions,
} from "@/lib/api/inbox-queries"
import {
  MAX_TEMPLATE_NAME_LENGTH,
  type TemplateFormInput,
  type TemplateFormValues,
  templateSchema,
} from "@/lib/schemas/inbox"

const EVERY_MAILBOX = ""

export interface InboxTemplateSettingsProps {
  mailboxes: InboxMailbox[]
  canAct: boolean
}

export function InboxTemplateSettings({
  mailboxes,
  canAct,
}: InboxTemplateSettingsProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const templates = useQuery(inboxTemplatesQueryOptions(EVERY_MAILBOX))
  const [mailboxId, setMailboxId] = useState(EVERY_MAILBOX)
  const empty: TemplateFormInput = {
    name: "",
    body: "",
    mailbox_id: EVERY_MAILBOX,
  }
  const form = useForm<TemplateFormInput, TemplateFormValues>({
    schema: templateSchema(t),
    defaultValues: empty,
  })
  const errors = form.formState.errors

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: inboxKeys.allTemplates })

  const failed = (error: unknown) => {
    const refusal = apiFailure(error)

    toasts.failed({
      title: refusal?.message ?? t("inbox.templateFailed"),
      fix: refusal?.fix ?? t("inbox.templateFailedFix"),
    })
  }

  const add = useMutation({
    mutationFn: (values: TemplateFormValues) =>
      createTemplate({
        name: values.name,
        body: values.body,
        mailbox_id: mailboxId === EVERY_MAILBOX ? null : mailboxId,
      }),
    onSuccess: async (_created, values) => {
      form.reset(empty)
      setMailboxId(EVERY_MAILBOX)
      toasts.done(t("inbox.templateSaved", { name: values.name }))
      await refresh()
    },
    onError: failed,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: refresh,
    onError: failed,
  })

  const submit = form.handleSubmit((values) => {
    add.mutate(values)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inbox.templatesTitle")}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        {(templates.data ?? []).length === 0 ? (
          <p className="text-[13px] text-ink-3">
            {t("inbox.templatesEmptyList")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(templates.data ?? []).map((template) => (
              <li
                className="flex items-start justify-between gap-3 rounded-md bg-sunken px-3 py-2"
                key={template.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-[13px] text-ink">
                    {template.name}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[12px] text-ink-3">
                    {template.body}
                  </p>
                </div>
                {canAct ? (
                  <ConfirmDialog
                    busy={remove.isPending}
                    confirmLabel={t("inbox.templateDelete")}
                    description={t("inbox.templateDeleteConfirm", {
                      name: template.name,
                    })}
                    onConfirm={() => {
                      remove.mutate(template.id)
                    }}
                    title={t("inbox.templateDelete")}
                    triggerIcon={Trash2}
                    triggerIconOnly
                    triggerLabel={t("inbox.templateDelete")}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canAct ? (
          <form
            className="flex flex-col gap-gutter"
            noValidate
            onSubmit={(event) => {
              submit(event)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="template-name">{t("inbox.templateName")}</Label>
              <Input
                autoComplete="off"
                id="template-name"
                maxLength={MAX_TEMPLATE_NAME_LENGTH}
                {...form.register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="template-body">{t("inbox.templateBody")}</Label>
              <Textarea id="template-body" {...form.register("body")} />
              <FieldError>{errors.body?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="template-mailbox">
                {t("inbox.templateMailbox")}
              </Label>
              <Select
                className="w-[260px]"
                id="template-mailbox"
                items={[
                  {
                    value: EVERY_MAILBOX,
                    label: t("inbox.templateEveryMailbox"),
                  },
                  ...mailboxes.map((mailbox) => ({
                    value: mailbox.id,
                    label: mailbox.display_name,
                  })),
                ]}
                onValueChange={setMailboxId}
                value={mailboxId}
              />
            </div>

            <div className="flex justify-end">
              <Button
                icon={Plus}
                loading={add.isPending}
                type="submit"
                variant="primary"
              >
                {t("inbox.templateCreate")}
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  )
}
