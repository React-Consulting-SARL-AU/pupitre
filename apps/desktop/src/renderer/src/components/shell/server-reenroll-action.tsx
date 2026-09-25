import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ReenrollState } from "@renderer/stores/reenroll";
import { KeyRound } from "lucide-react";

export function ServerReenrollAction({
  state,
  onRepair,
}: {
  state: ReenrollState;
  onRepair: () => void;
}) {
  const t = useTranslations();

  return (
    <Button
      icon={KeyRound}
      loading={state.status === "running"}
      onClick={onRepair}
      size="sm"
      variant="inverse"
    >
      {t("shell.restricted.repair")}
    </Button>
  );
}
