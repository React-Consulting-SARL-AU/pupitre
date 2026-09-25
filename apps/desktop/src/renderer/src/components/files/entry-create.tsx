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

export function EntryCreate({
  kind,
  name,
  disabled = false,
  onCreate,
}: {
  kind: EntryKind;
  name: string;
  disabled?: boolean;
  onCreate: (entry: string) => Promise<AgentError | null>;
}) {
  const t = useTranslations();

  // The dialog remounts on each open so it never remembers a previous name.
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
