import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldError } from "@/components/ui/field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { apiFailure } from "@/lib/api/errors"
import {
  createNote,
  deleteNote,
  type InboxNote,
  inboxKeys,
} from "@/lib/api/inbox-queries"
import { noteSchema } from "@/lib/schemas/inbox"
import { formatDateTime } from "@/lib/utils/format"

export interface InboxNotesPanelProps {
  threadId: string
  notes: InboxNote[]
  canAct: boolean
}

export function InboxNotesPanel({
  threadId,
  notes,
  canAct,
}: InboxNotesPanelProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const form = useForm({
    schema: noteSchema(t),
    defaultValues: { body: "" },
  })

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: inboxKeys.thread(threadId) }),
      queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
    ])

  function failed(error: unknown) {
    const refused = apiFailure(error)

    toasts.failed({
      title: refused?.message ?? t("inbox.noteFailed"),
      fix: refused?.fix ?? t("common.retryLater"),
    })
  }

  const add = useMutation({
    mutationFn: (body: string) => createNote(threadId, { body }),
    onSuccess: async () => {
      form.reset({ body: "" })
      await refresh()
    },
    onError: failed,
  })

  const remove = useMutation({
    mutationFn: (noteId: string) => deleteNote(threadId, noteId),
    onSuccess: refresh,
    onError: failed,
  })

  const submit = form.handleSubmit(({ body }) => {
    add.mutate(body)
  })

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? (
        <p className="text-[12px] text-ink-3">{t("inbox.noteEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li
              className="flex items-start justify-between gap-2 rounded-md bg-sunken px-3 py-2"
              key={note.id}
            >
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-[13px] text-ink-2">
                  {note.body}
                </p>
                <p className="text-[11px] text-ink-3">
                  {note.author?.name ?? ""} ·{" "}
                  {formatDateTime(note.created_at, t)}
                </p>
              </div>
              {canAct ? (
                <ConfirmDialog
                  busy={remove.isPending && remove.variables === note.id}
                  confirmLabel={t("inbox.noteDeleteConfirm")}
                  description={t("inbox.noteDeleteDescription")}
                  onConfirm={() => {
                    remove.mutate(note.id)
                  }}
                  title={t("inbox.noteDeleteTitle")}
                  triggerIcon={Trash2}
                  triggerIconOnly
                  triggerLabel={t("inbox.noteDelete")}
                  triggerVariant="ghost"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAct ? (
        <form
          className="flex flex-col gap-2"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <Label htmlFor="inbox-note">{t("inbox.addNote")}</Label>
          <Textarea
            className="min-h-20"
            id="inbox-note"
            placeholder={t("inbox.notePlaceholder")}
            {...form.register("body")}
          />
          <FieldError>{form.formState.errors.body?.message}</FieldError>
          <div className="flex justify-end">
            <Button icon={Plus} loading={add.isPending} size="sm" type="submit">
              {t("inbox.noteAdd")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
