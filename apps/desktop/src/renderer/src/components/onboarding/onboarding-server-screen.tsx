import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server, ServerDraft } from "@shared/servers";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { accountOf, useAccount } from "../../stores/account";
import type { ServerStage } from "../../stores/onboarding-machine";
import { useServers } from "../../stores/servers";
import { FleetPanel } from "../fleet/fleet-panel";
import { HostKeyAlert } from "../servers/host-key-alert";
import { ServerAddForm } from "../servers/server-add-form";
import { ServerKeyInstall } from "../servers/server-key-install";
import { Button } from "../ui/button";
import { Screen } from "../ui/screen";
import { Section } from "../ui/section";
import { OnboardingOrganizationNote } from "./onboarding-organization-note";
import { OnboardingServerChoice } from "./onboarding-server-choice";

type Stage = "pick" | "add" | "key";

export function OnboardingServerScreen({
  onContinue,
  onStage,
}: {
  onContinue: (serverId: string) => void;
  onStage?: (stage: ServerStage) => void;
}) {
  const t = useTranslations();

  const {
    activate,
    add,
    addition,
    checkHostKey,
    config,
    dismissHostKey,
    forgetAddition,
    hostKey,
    load,
    status,
    trustReinstalled,
  } = useServers();

  const identity = useAccount((s) => accountOf(s.view)?.identity ?? null);
  const switchOrganization = useAccount((s) => s.switchOrganization);

  const [stage, setStage] = useState<Stage | null>(null);
  const [trusting, setTrusting] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const servers = config?.servers ?? [];
  const active = config?.active ?? null;

  useEffect(() => {
    if (active) {
      checkHostKey(active);
    }
  }, [active, checkHostKey]);

  const added = addition.status === "added" ? addition : null;
  const here: Stage | null = added?.publicKey
    ? "key"
    : serverStage(stage, status, servers.length);

  useEffect(() => {
    onStage?.(here ?? "pick");
  }, [here, onStage]);

  async function pick(server: Server): Promise<void> {
    await activate(server.id);
    onContinue(server.id);
  }

  async function submit(draft: ServerDraft): Promise<void> {
    await add(draft);

    const state = useServers.getState().addition;

    // A refusal keeps the form open so its remedy and the typed values stay.
    if (state.status !== "added") {
      return;
    }

    // A system host has no key to lay; otherwise the new key takes the next screen.
    if (!state.publicKey) {
      forgetAddition();
      onContinue(state.server.id);
    }
  }

  function installed(server: Server): void {
    forgetAddition();
    onContinue(server.id);
  }

  async function reinstalled(id: string): Promise<void> {
    setTrusting(true);
    await trustReinstalled(id);
    setTrusting(false);
  }

  const refused = hostKey.status === "changed" ? hostKey : null;
  const refusedServer = servers.find((s) => s.id === refused?.serverId);

  return (
    <Screen
      column
      plain
      step={`server:${here ?? "pick"}`}
      title={t(`onboarding.server.${here ?? "pick"}.title`)}
    >
      {refused ? (
        <HostKeyAlert
          busy={trusting}
          onCancel={dismissHostKey}
          onReinstalled={() => reinstalled(refused.serverId)}
          serverName={refusedServer?.name ?? refused.serverId}
          state={refused}
        />
      ) : null}

      {identity && here !== "key" ? (
        <OnboardingOrganizationNote
          identity={identity}
          onSwitch={switchOrganization}
        />
      ) : null}

      {here === "key" ? null : <FleetPanel silentWhenEmpty />}

      {here === "pick" ? (
        <Section name="known" title={t("onboarding.server.knownHeading")}>
          {servers.map((server) => (
            <OnboardingServerChoice
              key={server.id}
              onPick={() => pick(server)}
              server={server}
            />
          ))}

          <div>
            <Button icon={Plus} onClick={() => setStage("add")}>
              {t("servers.addServer")}
            </Button>
          </div>
        </Section>
      ) : null}

      {here === "add" ? (
        <ServerAddForm
          busy={addition.status === "adding"}
          error={addition.status === "failed" ? addition.error : null}
          onCancel={
            servers.length > 0
              ? () => {
                  setStage("pick");
                  forgetAddition();
                }
              : undefined
          }
          onSubmit={submit}
        />
      ) : null}

      {here === "key" && added?.publicKey ? (
        <ServerKeyInstall
          copyId={added.copyId}
          doneLabel={t("servers.key.inspect")}
          onDone={() => installed(added.server)}
          publicKey={added.publicKey}
          server={added.server}
        />
      ) : null}
    </Screen>
  );
}

export function serverStage(
  asked: Stage | null,
  status: "idle" | "loading" | "ready",
  known: number
): Stage | null {
  if (asked) {
    return asked;
  }

  if (status !== "ready") {
    return null;
  }

  return known > 0 ? "pick" : "add";
}
