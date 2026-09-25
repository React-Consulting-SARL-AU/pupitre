import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { useState } from "react";
import { IconButton } from "../ui/icon-button";
import {
  ENTRY_CREATE_ICON,
  ENTRY_CREATE_KEYS,
  EntryCreateDialog,
  type EntryKind,
} from "./entry-create-dialog";

/**
 * The gesture that makes a file or a folder where the reader stands: one
 * button in the header, and the dialog it opens. The dialog is mounted anew
 * each time, so it never remembers a name from before.
 */
export function EntryCreate({
  kind,
  name,
  disabled = false,
  onCreate,
}: {
  kind: EntryKind;
  /** Ties the caption and the help to the input, and names it in a test. */
  name: string;
  /** No folder is on screen yet, so nothing can be made in it. */
  disabled?: boolean;
  onCreate: (entry: string) => Promise<AgentError | null>;
}) {
  const t = useTranslations();

  const [asking, setAsking] = useState(false);

  return (
    <>
      <IconButton
        disabled={disabled}
        icon={ENTRY_CREATE_ICON[kind]}
        label={t(ENTRY_CREATE_KEYS[kind].title)}
        onClick={() => setAsking(true)}
      />

      {asking ? (
        <EntryCreateDialog
          kind={kind}
          name={name}
          onClose={() => setAsking(false)}
          onCreate={onCreate}
        />
      ) : null}
    </>
  );
}
