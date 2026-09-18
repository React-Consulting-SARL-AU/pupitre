import { KIND_ICONS } from "@renderer/components/ui/agent-icons";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Menu } from "@renderer/components/ui/menu";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { TerminalKind } from "@shared/terminals";
import { Plus } from "lucide-react";

/**
 * The "+" of a row of sessions.
 *
 * With one kind to offer it opens that kind at once; with several it opens
 * the list — the shell, then each agent the machine holds. An agent that is
 * not installed is not listed: opening "Claude" where it does not exist gives
 * a terminal that dies at once.
 */
export function TerminalNewButton({
  kinds,
  chord,
  onNew,
}: {
  kinds: readonly TerminalKind[];
  /** What the tooltip prints before the key of the shortcut. */
  chord: string;
  onNew: (kind: TerminalKind) => void;
}) {
  const t = useTranslations();

  const label = t("terminals.newSessionHint", { chord });
  const only = kinds.length === 1 ? kinds[0] : null;

  if (only) {
    return (
      <IconButton
        icon={Plus}
        label={label}
        onClick={() => onNew(only)}
        size={12}
        variant="discreet"
      />
    );
  }

  return (
    <Menu
      entries={kinds.map((kind) => ({
        icon: KIND_ICONS[kind],
        id: kind,
        label: t(`terminals.kind.${kind}`),
      }))}
      icon={Plus}
      label={label}
      onPick={onNew}
      size={12}
    />
  );
}
