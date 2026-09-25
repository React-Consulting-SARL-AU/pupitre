import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight, RotateCcw } from "lucide-react";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";

export function InstallOutcomeBar({
  result,
  blocking,
  nameOf,
  onReplayAll,
  onContinue,
  replaying,
}: {
  result: InstallResult;
  blocking: readonly string[];
  nameOf: (moduleId: string) => string;
  onReplayAll?: () => Promise<void> | void;
  onContinue?: () => void;
  replaying?: string | null;
}) {
  const t = useTranslations();

  const blocked = blocking.length > 0;

  function note(): string | undefined {
    if (blocked) {
      return t("install.blocking", { names: blocking.map(nameOf).join(", ") });
    }

    if (result.failed.length > 0) {
      return t.plural("install.leftFailed", result.failed.length);
    }

    return undefined;
  }

  return (
    <ActionBar
      name="install"
      note={note()}
      tone={blocked ? "danger" : "neutral"}
    >
      {onReplayAll && result.failed.length > 1 ? (
        <Button
          icon={RotateCcw}
          loading={replaying === "*"}
          onClick={() => onReplayAll()}
        >
          {t("install.replayAll", { count: result.failed.length })}
        </Button>
      ) : null}
      <Button
        disabled={blocked}
        hint={blocked ? note() : undefined}
        icon={ArrowRight}
        onClick={onContinue}
        variant="inverse"
      >
        {t("install.continue")}
      </Button>
    </ActionBar>
  );
}
