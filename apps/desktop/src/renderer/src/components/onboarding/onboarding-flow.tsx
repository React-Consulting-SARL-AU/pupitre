import type { ModuleConfig } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useStepShift } from "@renderer/lib/use-step-shift";
import type { HardenOutcome } from "@shared/harden";
import { useEffect, useState } from "react";
import { useCatalog } from "../../stores/catalog";
import { hasCloudflare } from "../../stores/first-project";
import { useHarden } from "../../stores/harden";
import { probeOf } from "../../stores/inspection";
import { useInstall } from "../../stores/install";
import { useOnboarding } from "../../stores/onboarding";
import {
  ONBOARDING_STEPS,
  type ServerStage,
} from "../../stores/onboarding-machine";
import { useServers } from "../../stores/servers";
import { CatalogScreen } from "../catalog/catalog-screen";
import { FirstProjectScreen } from "../first-project/first-project-screen";
import { InstallScreen } from "../install/install-screen";
import { WaitingNotice } from "../ui/waiting-notice";
import { OnboardingAgentScreen } from "./onboarding-agent-screen";
import { OnboardingBanner } from "./onboarding-banner";
import { OnboardingConfigStep } from "./onboarding-config-step";
import { OnboardingDoneScreen } from "./onboarding-done-screen";
import { OnboardingHardenScreen } from "./onboarding-harden-screen";
import { OnboardingInspectionScreen } from "./onboarding-inspection-screen";
import { OnboardingServerScreen } from "./onboarding-server-screen";
import { OnboardingShell } from "./onboarding-shell";

function rootState(outcome: HardenOutcome | null): "closed" | "kept" | "open" {
  if (outcome?.harden.root_closed) {
    return "closed";
  }

  return outcome?.harden.root_kept ? "kept" : "open";
}

/**
 * The onboarding, in the one order that works.
 *
 * The order itself is the machine's, and every step is reached by an event that
 * justifies it rather than by naming it: there is no way to land on the install
 * with nothing selected. This component says what each screen answers with, and
 * nothing else — the shell around it stays put while the body alone changes.
 */
export function OnboardingFlow() {
  const t = useTranslations();

  const step = useOnboarding((state) => state.step);
  const serverId = useOnboarding((state) => state.serverId);
  const replaying = useOnboarding((state) => state.replaying);
  const remaining = useOnboarding((state) => state.remaining);
  const recovering = useOnboarding((state) => state.recovering);
  const send = useOnboarding((state) => state.send);
  const back = useOnboarding((state) => state.back);
  const canGoBack = useOnboarding((state) => state.canGoBack);
  const close = useOnboarding((state) => state.close);

  const install = useInstall((state) => state.install);
  const requested = useInstall((state) => state.requested);
  const touched = useInstall((state) => state.touched());

  const config = useServers((state) => state.config);
  const loadServers = useServers((state) => state.load);

  const [stage, setStage] = useState<ServerStage>("pick");

  // The rail follows the demand at once; the panel takes the time to leave.
  const { shown, motion } = useStepShift(step, (candidate) =>
    ONBOARDING_STEPS.indexOf(candidate as (typeof ONBOARDING_STEPS)[number])
  );

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // The way back closes when the machine has changed, and not when the button
  // was pressed: an install refused before its first step left it untouched.
  useEffect(() => {
    if (touched) {
      useOnboarding.getState().send({ type: "touched" });
    }
  }, [touched]);

  const server = config?.servers.find((candidate) => candidate.id === serverId);
  const outcome = useHarden((state) =>
    state.harden.status === "done" ? state.harden.outcome : null
  );

  const present = probeOf(serverId)?.installed_modules ?? [];
  const failed = install.status === "done" ? install.result.failed : [];
  const cloudflare = hasCloudflare(present, requested.modules, failed);

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
    send({ type: "replayConfigured" });

    if (serverId) {
      await useInstall
        .getState()
        .replay(serverId, moduleId, configOf(moduleId));
    }
  }

  function screen() {
    if (shown === "closed") {
      return null;
    }

    if (!(serverId && server) || shown === "server") {
      return (
        <OnboardingServerScreen
          onContinue={(id) => send({ serverId: id, type: "serverChosen" })}
          onStage={setStage}
        />
      );
    }

    if (shown === "inspection") {
      return (
        <OnboardingInspectionScreen
          onContinue={() => send({ type: "inspected" })}
          onInstall={() => send({ type: "needsAgent" })}
          onPickAnother={() => send({ type: "pickAnother" })}
          onUpgrade={() => send({ type: "needsAgent" })}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (shown === "agent") {
      return (
        <OnboardingAgentScreen
          onContinue={() => send({ type: "agentSent" })}
          serverName={server.name}
        />
      );
    }

    if (shown === "catalog") {
      return (
        <CatalogScreen
          onConfigure={() => send({ type: "chosen" })}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (shown === "config") {
      return (
        <OnboardingConfigStep
          onBack={back}
          onInstall={() => {
            useInstall.getState().reset();
            send({ type: "configured" });
          }}
          onReplay={confirmReplay}
          remaining={remaining}
          replaying={replaying}
          serverName={server.name}
        />
      );
    }

    if (shown === "install") {
      return (
        <InstallScreen
          modules={remaining.length > 0 ? remaining : undefined}
          onContinue={() => send({ type: "installed" })}
          onReplay={replayModule}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (shown === "harden") {
      return (
        <OnboardingHardenScreen
          onContinue={() => send({ type: "hardened" })}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    if (shown === "project") {
      return (
        <FirstProjectScreen
          cloudflare={cloudflare}
          onFinish={() => send({ type: "projectDone" })}
          onSkip={() => send({ type: "projectDone" })}
          serverId={serverId}
          serverName={server.name}
        />
      );
    }

    return (
      <OnboardingDoneScreen
        onClose={close}
        root={rootState(outcome)}
        serverName={server.name}
        user={outcome?.user ?? server.user}
      />
    );
  }

  if (step === "closed") {
    return null;
  }

  return (
    <OnboardingShell
      banner={
        <OnboardingBanner serverId={serverId} serverName={server?.name} />
      }
      canGoBack={canGoBack()}
      onBack={back}
      onClose={close}
      serverName={server?.name}
      stage={step === "server" ? stage : undefined}
      step={step}
    >
      <div
        className={`mx-auto w-full max-w-3xl px-8 py-10 ${motion}`}
        key={shown}
      >
        {/*
          While the machine is being read again, no screen acts: a server whose
          state the app has only remembered is one it must not touch.
        */}
        {recovering ? (
          <WaitingNotice
            detail={t("onboarding.resume.readingDetail")}
            note={t("onboarding.resume.readingNote")}
            title={t("onboarding.resume.readingTitle")}
          />
        ) : (
          screen()
        )}
      </div>
    </OnboardingShell>
  );
}
