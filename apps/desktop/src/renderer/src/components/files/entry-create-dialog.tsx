import { entryProblem } from "@renderer/i18n/entry-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isEntryName } from "@renderer/lib/files";
import type { AgentError } from "@shared/agent";
import { FilePlus, FolderPlus, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { controlClass, Field, fieldAria } from "../ui/field";

export type EntryKind = "file" | "dir";

export const ENTRY_CREATE_ICON: Record<EntryKind, LucideIcon> = {
  dir: FolderPlus,
  file: FilePlus,
};

export const ENTRY_CREATE_KEYS = {
  dir: {
    placeholder: "files.newFolder.placeholder",
    title: "files.newFolder.title",
  },
  file: {
    placeholder: "files.newFile.placeholder",
    title: "files.newFile.title",
  },
} as const;

export function EntryCreateDialog({
  kind,
  name,
  onCreate,
  onClose,
}: {
  kind: EntryKind;
  name: string;
  onCreate: (entry: string) => Promise<AgentError | null>;
  onClose: () => void;
}) {
  const t = useTranslations();

  const input = useRef<HTMLInputElement | null>(null);
  const [wanted, setWanted] = useState("");
  const [refusal, setRefusal] = useState<AgentError | null>(null);

  const entry = wanted.trim();
  const ready = entry.length > 0 && isEntryName(entry);
  const problem = entryProblem(t, entry, refusal);

  async function create() {
    if (!ready) {
      return;
    }

    const refused = await onCreate(entry);

    if (refused) {
      setRefusal(refused);
      input.current?.focus();

      return;
    }

    onClose();
  }

  return (
    <Dialog
      actions={
        <>
          <Button onClick={onClose} size="sm" variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready}
            icon={ENTRY_CREATE_ICON[kind]}
            onClick={create}
            size="sm"
            variant="inverse"
          >
            {t("files.new.create")}
          </Button>
        </>
      }
      focus={input}
      name={name}
      onClose={onClose}
      open
      title={t(ENTRY_CREATE_KEYS[kind].title)}
    >
      <Field label={t("files.new.label")} name={name} problem={problem}>
        <input
          {...fieldAria({ name, problem: Boolean(problem) })}
          className={controlClass("data", Boolean(problem))}
          onChange={(event) => {
            setWanted(event.target.value);
            setRefusal(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              create();
            }
          }}
          placeholder={t(ENTRY_CREATE_KEYS[kind].placeholder)}
          ref={input}
          value={wanted}
        />
      </Field>
    </Dialog>
  );
}
