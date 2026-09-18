import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ServerChanges, ServerDraft } from "@shared/servers";
import { movesConnection } from "@shared/servers";
import { ExternalLink, Plus, Server as ServerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { accountOf, useAccount } from "../../stores/account";
import { useFleet } from "../../stores/fleet";
import { useServers } from "../../stores/servers";
import { FleetPanel } from "../fleet/fleet-panel";
import { OnboardingEntry } from "../onboarding/onboarding-entry";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { HostKeyAlert } from "./host-key-alert";
import { ServerAddForm } from "./server-add-form";
import { ServerKeyInstall } from "./server-key-install";
import { ServerRow } from "./server-row";

/**
 * The servers screen: the machines you drive, and how to add one.
 *
 * Everything that touches a file happens in the main process; this screen shows
 * what it answered. The host key sits above the list rather than inside it,
 * because a refused connection is not a detail of one row: it is the reason
 * nothing works.
 *
 * This is the panel of the settings, where a server is managed: renamed, made
 * active, deleted. A machine the organization grants is one row of the same
 * list, with the console's word among its facts. The assistant has its own
 * screen for the same machines, because choosing one is not managing them.
 */
export function ServersPanel({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations();

  const {
    addition,
    activate,
    add,
    checkHostKey,
    config,
    dismissHostKey,
    edit,
    forgetAddition,
    forgetEdit,
    forget,
    hostKey,
    load,
    remove,
    removal,
    rename,
    trustReinstalled,
    update,
  } = useServers();

  const consoleUrl = useAccount((s) => accountOf(s.view)?.consoleUrl ?? null);
  const opening = useFleet((s) => s.opening);
  const open = useFleet((s) => s.open);

  const [adding, setAdding] = useState(false);
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

  async function run(work: Promise<void>) {
    await work;
    onChanged?.();
  }

  function change(id: string, changes: ServerChanges): Promise<void> {
    return movesConnection(changes)
      ? run(update(id, changes))
      : update(id, changes);
  }

  async function submit(draft: ServerDraft) {
    await add(draft);

    const state = useServers.getState().addition;

    // A refusal keeps the form open, with its remedy: closing it would take the
    // typed values away along with the explanation.
    if (state.status !== "added") {
      return;
    }

    setAdding(false);
    onChanged?.();

    // A system host already opens the machine: there is no key to install and
    // nothing to wait for.
    if (!state.publicKey) {
      forgetAddition();
    }
  }

  async function reinstalled(id: string) {
    setTrusting(true);
    await trustReinstalled(id);
    setTrusting(false);
    onChanged?.();
  }

  const refused = hostKey.status === "changed" ? hostKey : null;
  const refusedServer = servers.find((s) => s.id === refused?.serverId);
  const justAdded = addition.status === "added" ? addition : null;

  return (
    <div className="flex flex-col gap-section">
      {refused ? (
        <HostKeyAlert
          busy={trusting}
          onCancel={dismissHostKey}
          onReinstalled={() => reinstalled(refused.serverId)}
          serverName={refusedServer?.name ?? refused.serverId}
          state={refused}
        />
      ) : null}

      <Section
        actions={
          <>
            {/* Members, assignment and revocation live on the console, not here. */}
            {consoleUrl ? (
              <Button
                icon={ExternalLink}
                onClick={() => window.pupitre.openUrl(consoleUrl)}
                size="sm"
              >
                {t("fleet.console.open")}
              </Button>
            ) : null}
            {servers.length > 0 && !adding ? (
              <Button icon={Plus} onClick={() => setAdding(true)} size="sm">
                {t("servers.addServer")}
              </Button>
            ) : null}
          </>
        }
        name="servers"
        title={t("servers.panel.heading")}
      >
        {servers.length === 0 ? (
          <Panel inset="none">
            <EmptyState
              action={
                adding ? null : (
                  <Button
                    icon={Plus}
                    onClick={() => setAdding(true)}
                    variant="inverse"
                  >
                    {t("servers.addServer")}
                  </Button>
                )
              }
              icon={ServerIcon}
              title={t("servers.panel.emptyTitle")}
            />
          </Panel>
        ) : (
          <div className="flex flex-col gap-gutter">
            {servers.map((server) => (
              <ServerRow
                active={server.id === active}
                edit={edit}
                footer={<OnboardingEntry server={server} />}
                key={server.id}
                onActivate={() => run(activate(server.id))}
                onForget={() => run(forget(server.id))}
                onForgetEdit={forgetEdit}
                onOpen={() => open(server.id)}
                onRemove={() => run(remove(server.id))}
                onRename={(name) => rename(server.id, name)}
                onUpdate={(changes) => change(server.id, changes)}
                opening={
                  opening.status !== "idle" && opening.serverId === server.id
                    ? opening
                    : null
                }
                refusal={
                  removal.status === "refused" &&
                  removal.serverId === server.id ? (
                    <Callout
                      fix={agentText(t, removal.error).fix}
                      tone="danger"
                    >
                      {agentText(t, removal.error).message}
                    </Callout>
                  ) : null
                }
                server={server}
              />
            ))}
          </div>
        )}
      </Section>

      <FleetPanel />

      {adding ? (
        <ServerAddForm
          busy={addition.status === "adding"}
          error={addition.status === "failed" ? addition.error : null}
          onCancel={() => {
            setAdding(false);
            forgetAddition();
          }}
          onSubmit={submit}
        />
      ) : null}

      {justAdded?.publicKey ? (
        <ServerKeyInstall
          copyId={justAdded.copyId}
          onDone={forgetAddition}
          publicKey={justAdded.publicKey}
          server={justAdded.server}
        />
      ) : null}
    </div>
  );
}
