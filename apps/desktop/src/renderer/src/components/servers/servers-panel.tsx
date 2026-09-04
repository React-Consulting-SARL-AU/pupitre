import type { ServerDraft } from "@shared/servers";
import { Plus, Server as ServerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useServers } from "../../stores/servers";
import { OnboardingEntry } from "../onboarding/onboarding-entry";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Label } from "../ui/label";
import { HostKeyAlert } from "./host-key-alert";
import { ServerAddForm } from "./server-add-form";
import { ServerKeyCard } from "./server-key-card";
import { ServerRow } from "./server-row";

/**
 * The servers screen: the machines you drive, and how to add one.
 *
 * Everything that touches a file happens in the main process; this screen shows
 * what it answered. The host key sits above the list rather than inside it,
 * because a refused connection is not a detail of one row: it is the reason
 * nothing works.
 */
export function ServersPanel({ onChanged }: { onChanged?: () => void }) {
  const {
    addition,
    activate,
    add,
    checkHostKey,
    config,
    dismissHostKey,
    forgetAddition,
    hostKey,
    load,
    remove,
    rename,
    trustReinstalled,
  } = useServers();

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

  async function submit(draft: ServerDraft) {
    await add(draft);

    // A refusal keeps the form open, with its remedy: closing it would take the
    // typed values away along with the explanation.
    if (useServers.getState().addition.status === "added") {
      setAdding(false);
      onChanged?.();
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

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <Label>Vos serveurs</Label>
            <p className="mt-1 text-ink-3 leading-relaxed">
              L'app garde une configuration SSH à elle, une clé par serveur dans
              son dossier, et l'empreinte de chaque machine dès le premier
              contact.
            </p>
          </div>
          {servers.length > 0 && !adding ? (
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Ajouter un serveur
            </Button>
          ) : null}
        </div>

        {servers.length === 0 ? (
          <div className="mt-5 rounded-md border border-line border-dashed">
            <EmptyState
              action={
                adding ? null : (
                  <Button
                    icon={Plus}
                    onClick={() => setAdding(true)}
                    variant="inverse"
                  >
                    Ajouter un serveur
                  </Button>
                )
              }
              detail="Une adresse, un compte, et une clé que l'app génère pour cet ordinateur."
              icon={ServerIcon}
              title="Aucun serveur pour l'instant"
            />
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-gutter">
            {servers.map((server) => (
              <div className="flex flex-col gap-3" key={server.id}>
                <OnboardingEntry server={server} />
                <ServerRow
                  active={server.id === active}
                  onActivate={() => run(activate(server.id))}
                  onRemove={() => run(remove(server.id))}
                  onRename={(name) => run(rename(server.id, name))}
                  server={server}
                />
              </div>
            ))}
          </div>
        )}
      </section>

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
        <ServerKeyCard
          copyId={justAdded.copyId}
          onDone={forgetAddition}
          publicKey={justAdded.publicKey}
          server={justAdded.server}
        />
      ) : null}
    </div>
  );
}
