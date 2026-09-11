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
import { Label } from "../ui/label";
import { Screen } from "../ui/screen";
import { OnboardingOrganizationNote } from "./onboarding-organization-note";
import { OnboardingServerChoice } from "./onboarding-server-choice";

/**
 * The first step: the machine to drive, and the key that opens it.
 *
 * A sequence, not a list. You pick a machine already known, or describe one,
 * and the key that follows installs itself: each screen leads to the next where
 * you have just acted. Nothing asks you to scroll back up to continue, and
 * nothing leaves you waiting in front of an empty card — a computer that knows
 * no machine yet opens the form.
 *
 * Granted servers stay above throughout: a grant lands while you are typing,
 * and it beats what you are entering.
 */

type Stage = "pick" | "add" | "key";

export function OnboardingServerScreen({
  onContinue,
  onStage,
}: {
  onContinue: (serverId: string) => void;
  /** Where this step is within itself, so the rail shows it rather than hiding it. */
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

  // A machine that was just added is waiting on its key: that's the next
  // screen, and nobody has to ask to go there.
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

    // A refusal keeps the form open with its remedy: closing it would carry
    // away the explanation along with what was typed.
    if (state.status !== "added") {
      return;
    }

    // A system host already opens the machine: there's nothing to install
    // and nothing to wait for. Otherwise the key just made takes the next screen.
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
      eyebrow={t("onboarding.server.eyebrow")}
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
        <section className="flex flex-col gap-4">
          <Label>{t("onboarding.server.knownHeading")}</Label>

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
        </section>
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

/**
 * The step to show: the one asked for, otherwise the one the list imposes.
 *
 * With no known machine there is nothing to pick, and the form is the step;
 * with one, the choice is. Before the list has been read, neither.
 */
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
