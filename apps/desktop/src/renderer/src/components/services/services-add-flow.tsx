import type { ModuleConfig } from "@pupitre/shared/agent-protocol/install";
import { CatalogScreen } from "@renderer/components/catalog/catalog-screen";
import { ConfigScreen } from "@renderer/components/config/config-screen";
import { InstallScreen } from "@renderer/components/install/install-screen";
import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { carriesSecret } from "@renderer/lib/catalog-selection";
import { STEP_COLUMN } from "@renderer/lib/layout";
import { useCatalog } from "@renderer/stores/catalog";
import { useInstall } from "@renderer/stores/install";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Adding a module to a server that already runs some.
 *
 * There is no second catalogue, no second configuration screen and no second
 * report: these are the ones the onboarding walks through, mounted again with
 * the modules already installed declared as such — so the questions asked are
 * the new module's own, and the machine is not reconfigured around it.
 */

type Step = "catalog" | "config" | "install";

export function ServicesAddFlow({
  serverId,
  serverName,
  installed,
  onDone,
}: {
  serverId: string;
  serverName?: string;
  /** The identifiers the snapshot reports, so the catalogue skips them. */
  installed: readonly string[];
  onDone: () => void;
}) {
  const t = useTranslations();

  const [step, setStep] = useState<Step>("catalog");
  const [replaying, setReplaying] = useState<string | null>(null);

  useEffect(() => {
    useInstall.getState().reset();
    useCatalog.getState().load(serverId, installed);
  }, [serverId, installed]);

  function configOf(moduleId: string): ModuleConfig {
    return { [moduleId]: useCatalog.getState().config()[moduleId] ?? {} };
  }

  /**
   * A module that carried a secret cannot simply run again: the vault was
   * emptied when the secrets left, so its configuration is asked a second time.
   */
  async function replay(moduleId: string): Promise<void> {
    const manifest = useCatalog
      .getState()
      .modules()
      .find((candidate) => candidate.id === moduleId);

    if (manifest && carriesSecret(manifest)) {
      setReplaying(moduleId);
      setStep("config");

      return;
    }

    await useInstall.getState().replay(serverId, moduleId, configOf(moduleId));
  }

  async function confirmReplay(moduleId: string): Promise<void> {
    await useCatalog.getState().settled();
    setReplaying(null);
    setStep("install");

    await useInstall.getState().replay(serverId, moduleId, configOf(moduleId));
  }

  return (
    <section className="flex min-h-full flex-col gap-gutter">
      <div className={`${STEP_COLUMN} flex justify-end`}>
        <Button icon={X} onClick={onDone} variant="discreet">
          {t("services.add.quit")}
        </Button>
      </div>

      {step === "catalog" ? (
        <CatalogScreen
          onConfigure={() => setStep("config")}
          serverId={serverId}
          serverName={serverName}
        />
      ) : null}

      {step === "config" ? (
        <ConfigScreen
          onBack={replaying ? undefined : () => setStep("catalog")}
          onInstall={() =>
            replaying ? confirmReplay(replaying) : setStep("install")
          }
          only={replaying ? [replaying] : undefined}
          serverName={serverName}
          submitLabel={
            replaying ? t("services.add.replay") : t("services.add.submit")
          }
        />
      ) : null}

      {step === "install" ? (
        <InstallScreen
          onContinue={onDone}
          onReplay={replay}
          serverId={serverId}
          serverName={serverName}
        />
      ) : null}
    </section>
  );
}
