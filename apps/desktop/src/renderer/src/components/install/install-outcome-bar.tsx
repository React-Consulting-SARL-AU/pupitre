import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight, RotateCcw } from "lucide-react";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";

/**
 * The way out of the installation, and what stands in it.
 *
 * The bar stays open unless what failed was something the rest depends on;
 * then the button waits, and says why at its own height. When several
 * services failed and all of them can simply run again, one gesture retries
 * them together.
 */
export function InstallOutcomeBar({
  result,
  blocking,
  nameOf,
  onReplayAll,
  onContinue,
  replaying,
}: {
  result: InstallResult;
  /** Failed modules the catalogue calls mandatory: the ones that bar the way. */
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
