import { useQuery } from "@tanstack/react-query"
import { NotebookPen } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { useTranslations } from "@/hooks/use-locale"
import { inboxTemplatesQueryOptions } from "@/lib/api/inbox-queries"

export interface InboxTemplateMenuProps {
  mailboxId: string
  onPick: (body: string) => void
  disabled?: boolean
}

/** The console fills the field; the server never hears about a canned reply. */
export function InboxTemplateMenu({
  mailboxId,
  onPick,
  disabled = false,
}: InboxTemplateMenuProps) {
  const t = useTranslations()
  const templates = useQuery(inboxTemplatesQueryOptions(mailboxId))

  return (
    <MenuRoot>
      <MenuTrigger
        render={
          <Button disabled={disabled} icon={NotebookPen} size="sm">
            {t("inbox.useTemplate")}
          </Button>
        }
      />
      <MenuPopup>
        {(templates.data ?? []).length === 0 ? (
          <p className="px-3 py-2 text-[13px] text-ink-3">
            {t("inbox.templatesEmpty")}
          </p>
        ) : null}
        {(templates.data ?? []).map((template) => (
          <MenuItem
            key={template.id}
            onClick={() => {
              onPick(template.body)
            }}
          >
            {template.name}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuRoot>
  )
}
