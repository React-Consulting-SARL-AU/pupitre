import type { ModuleConfig } from "@pupitre/shared/agent-protocol/install";
import { CatalogScreen } from "@renderer/components/catalog/catalog-screen";
import { ConfigScreen } from "@renderer/components/config/config-screen";
import { InstallScreen } from "@renderer/components/install/install-screen";
import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { carriesSecret } from "@renderer/lib/catalog-selection";
import { useCatalog } from "@renderer/stores/catalog";
import { useInstall } from "@renderer/stores/install";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Step = "catalog" | "config" | "install";

export function ServicesAddFlow({
  serverId,
  serverName,
  installed,
  onDone,
}: {
  serverId: string;
  serverName?: string;
  installed: readonly string[];
  onDone: () => void;
}) {
  const t = useTranslations();

  const [step, setStep] = useState<Step>("catalog");
  const [replaying, setReplaying] = useState<string | null>(null);

  // Frozen at entry: the polled snapshot hands a new array every few seconds.
  const [entered] = useState(() => installed.join(" "));

  useEffect(() => {
    useInstall.getState().reset();
    useCatalog
      .getState()
      .load(serverId, entered.length > 0 ? entered.split(" ") : []);
  }, [serverId, entered]);

  function configOf(moduleId: string): ModuleConfig {
    return { [moduleId]: useCatalog.getState().config()[moduleId] ?? {} };
  }

  // A module that carried a secret is asked again: the vault was emptied after the run.
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

  async function install(): Promise<void> {
    setStep("install");

    await useInstall.getState().startChosen(serverId);
  }

  const quit = (
    <Button icon={X} onClick={onDone} variant="discreet">
      {t("services.add.quit")}
    </Button>
  );

  return (
    <>
      {step === "catalog" ? (
        <CatalogScreen
          actions={quit}
          onConfigure={() => setStep("config")}
          serverId={serverId}
          serverName={serverName}
        />
      ) : null}

      {step === "config" ? (
        <ConfigScreen
          actions={quit}
          onBack={replaying ? undefined : () => setStep("catalog")}
          onInstall={() => (replaying ? confirmReplay(replaying) : install())}
          only={replaying ? [replaying] : undefined}
          serverName={serverName}
          submitLabel={
            replaying ? t("services.add.replay") : t("services.add.submit")
          }
        />
      ) : null}

      {step === "install" ? (
        <InstallScreen
          actions={quit}
          onContinue={onDone}
          onReplay={replay}
          serverId={serverId}
          serverName={serverName}
        />
      ) : null}
    </>
  );
}
