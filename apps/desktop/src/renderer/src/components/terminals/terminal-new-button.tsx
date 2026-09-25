import { KIND_ICONS } from "@renderer/components/ui/agent-icons";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Menu } from "@renderer/components/ui/menu";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { TerminalKind } from "@shared/terminals";
import { Plus } from "lucide-react";

export function TerminalNewButton({
  kinds,
  chord,
  onNew,
}: {
  kinds: readonly TerminalKind[];
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
