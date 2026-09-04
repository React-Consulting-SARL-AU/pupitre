import type { ModuleConfig } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowLeft, X } from "lucide-react";
import { useEffect } from "react";
import { useCatalog } from "../../stores/catalog";
import { hasCloudflare } from "../../stores/first-project";
import { useHarden } from "../../stores/harden";
import { probeOf } from "../../stores/inspection";
import { useInstall } from "../../stores/install";
import { useOnboarding } from "../../stores/onboarding";
import { useServers } from "../../stores/servers";
import { CatalogScreen } from "../catalog/catalog-screen";
import { FirstProjectScreen } from "../first-project/first-project-screen";
import { InstallScreen } from "../install/install-screen";
import { Button } from "../ui/button";
import { OnboardingAgentScreen } from "./onboarding-agent-screen";
import { OnboardingConfigStep } from "./onboarding-config-step";
import { OnboardingDoneScreen } from "./onboarding-done-screen";
import { OnboardingHardenScreen } from "./onboarding-harden-screen";
import { OnboardingInspectionScreen } from "./onboarding-inspection-screen";
import { OnboardingProgress } from "./onboarding-progress";
import { OnboardingServerScreen } from "./onboarding-server-screen";

/**
 * The onboarding, in the one order that works.
 *
 * Server, inspection, agent, catalogue, configuration, installation,
 * hardening. The agent's binary goes before the catalogue and not with the
 * install, because the catalogue is the agent's own answer and a bare machine
 * has none to give. Each screen here is the one its own task built: this
 * component only says which comes next, and what each answer means for the one
 * after it.
 */
export function OnboardingFlow() {
  const t = useTranslations();

  const step = useOnboarding((state) => state.step);
  const serverId = useOnboarding((state) => state.serverId);
  const replaying = useOnboarding((state) => state.replaying);
  const goTo = useOnboarding((state) => state.goTo);
  const begin = useOnboarding((state) => state.begin);
  const back = useOnboarding((state) => state.back);
  const canGoBack = useOnboarding((state) => state.canGoBack);
  const close = useOnboarding((state) => state.close);

  const install = useInstall((state) => state.install);
  const requested = useInstall((state) => state.requested);

  const config = useServers((state) => state.config);
  const loadServers = useServers((state) => state.load);
  const rename = useServers((state) => state.rename);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const server = config?.servers.find((candidate) => candidate.id === serverId);
  const outcome = useHarden((state) =>
    state.harden.status === "done" ? state.harden.outcome : null
  );

  const cloudflare = hasCloudflare(
    probeOf(serverId)?.installed_modules ?? [],
    requested.modules,
    install.status === "done" ? install.result.failed : []
  );

  function configOf(moduleId: string): ModuleConfig {
    return { [moduleId]: useCatalog.getState().config()[moduleId] ?? {} };
  }

  async function replayModule(moduleId: string): Promise<void> {
    if (useOnboarding.getState().replay(moduleId) === "config") {
      return;
    }

    if (serverId) {
      await useInstall
        .getState()
        .replay(serverId, moduleId, configOf(moduleId));
    }
  }

  async function confirmReplay(moduleId: string): Promise<void> {
    await useCatalog.getState().settled();
    useOnboarding.getState().endReplay();

    if (serverId) {
      await useInstall
        .getState()
        .replay(serverId, moduleId, configOf(moduleId));
    }
  }

  function screen() {
    if (step === "closed") {
      return null;
    }

    if (!(serverId && server) || step === "server") {
      return <OnboardingServerScreen onContinue={begin} />;
    }

    if (step === "inspection") {
      return (
        <OnboardingInspectionScreen
          onContinue={() => goTo("catalog")}
          onInstall={() => goTo("agent")}
          onPickAnother={() => goTo("server")}
          onUpgrade={() => goTo("agent")}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (step === "agent") {
      return (
        <OnboardingAgentScreen
          onContinue={() => goTo("catalog")}
          serverName={server.name}
        />
      );
    }

    if (step === "catalog") {
      return (
        <CatalogScreen
          onConfigure={() => goTo("config")}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (step === "config") {
      return (
        <OnboardingConfigStep
          machineName={server.name}
          onBack={() => goTo("catalog")}
          onInstall={() => {
            goTo("install");
            useOnboarding.getState().noteInstalled();
          }}
          onMachineName={(name) => rename(serverId, name)}
          onReplay={confirmReplay}
          replaying={replaying}
          serverName={server.name}
        />
      );
    }

    if (step === "install") {
      return (
        <InstallScreen
          onContinue={() => goTo("harden")}
          onReplay={replayModule}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (step === "harden") {
      return (
        <OnboardingHardenScreen
          onContinue={() => goTo("project")}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (step === "project") {
      return (
        <FirstProjectScreen
          cloudflare={cloudflare}
          onFinish={() => goTo("done")}
          onSkip={() => goTo("done")}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    return (
      <OnboardingDoneScreen
        onClose={close}
        rootClosed={outcome?.harden.root_closed ?? false}
        serverName={server.name}
        user={outcome?.user ?? server.user}
      />
    );
  }

  if (step === "closed") {
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-base">
      <header className="draggable flex shrink-0 flex-wrap items-center justify-between gap-4 border-line border-b bg-surface px-8 py-5">
        <OnboardingProgress step={step} />

        <div className="clickable flex items-center gap-2">
          {canGoBack() ? (
            <Button icon={ArrowLeft} onClick={back} variant="discreet">
              {t("onboarding.flow.back")}
            </Button>
          ) : null}
          <Button icon={X} onClick={close} variant="discreet">
            {t("onboarding.flow.quit")}
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-8 py-8">{screen()}</div>
    </div>
  );
}
