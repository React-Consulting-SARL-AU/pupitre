import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ReenrollState } from "@renderer/stores/reenroll";
import { KeyRound } from "lucide-react";

/**
 * The gesture that repairs a restricted server: a fresh enrolment, replayed on
 * the machine that is already installed.
 *
 * It is offered next to the console rather than instead of it — the console is
 * where a subscription is settled, this is where a lost or revoked token is
 * mended, and only the second is something the app can do itself.
 */
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
