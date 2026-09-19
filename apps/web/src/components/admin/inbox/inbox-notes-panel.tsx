import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import {
  createNote,
  deleteNote,
  type InboxNote,
  inboxKeys,
} from "@/lib/api/inbox-queries"
import { formatDateTime } from "@/lib/utils/format"

export interface InboxNotesPanelProps {
  threadId: string
  notes: InboxNote[]
}

export function InboxNotesPanel({ threadId, notes }: InboxNotesPanelProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const [body, setBody] = useState("")
  const [refusal, setRefusal] = useState<string | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: inboxKeys.thread(threadId) }),
      queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
    ])

  const add = useMutation({
    mutationFn: () => createNote(threadId, { body: body.trim() }),
    onSuccess: async () => {
      setBody("")
      await refresh()
    },
    onError: () => {
      toasts.failed({
        title: t("inbox.noteFailed"),
        fix: t("inbox.noteFailedFix"),
      })
    },
  })

  const remove = useMutation({
    mutationFn: (noteId: string) => deleteNote(threadId, noteId),
    onSuccess: refresh,
    onError: () => {
      toasts.failed({
        title: t("inbox.noteFailed"),
        fix: t("inbox.noteFailedFix"),
      })
    },
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
              <Button
                aria-label={t("inbox.noteDelete")}
                className="w-7 shrink-0 px-0"
                icon={Trash2}
                loading={remove.isPending}
                onClick={() => {
                  remove.mutate(note.id)
                }}
                size="sm"
                title={t("inbox.noteDelete")}
                variant="ghost"
              />
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()

          if (body.trim() === "") {
            setRefusal(t("inbox.noteRequired"))

            return
          }

          setRefusal(null)
          add.mutate()
        }}
      >
        <Label htmlFor="inbox-note">{t("inbox.addNote")}</Label>
        <Textarea
          className="min-h-20"
          id="inbox-note"
          onChange={(event) => {
            setBody(event.target.value)
          }}
          placeholder={t("inbox.notePlaceholder")}
          value={body}
        />
        <FieldError>{refusal}</FieldError>
        <div className="flex justify-end">
          <Button icon={Plus} loading={add.isPending} size="sm" type="submit">
            {t("inbox.noteAdd")}
          </Button>
        </div>
      </form>
    </div>
  )
}
