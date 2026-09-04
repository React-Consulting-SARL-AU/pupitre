import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { plural, weight } from "@renderer/lib/format";
import { useShots } from "@renderer/stores/shots";
import { ExternalLink, Image as ImageIcon, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { ShotRow } from "./shot-row";

/**
 * The captures the agents left behind.
 *
 * The images stay on the server: what the app shows is what `shots.list` says
 * of them, and the gallery the server serves is opened at its own address. The
 * one action that changes anything is emptying the folder.
 */
export function ShotsScreen({ serverId }: { serverId: string }) {
  const state = useShots((s) => s.state);
  const problem = useShots((s) => s.problem);
  const cleaning = useShots((s) => s.cleaning);
  const removed = useShots((s) => s.removed);
  const read = useShots((s) => s.read);
  const clean = useShots((s) => s.clean);
  const openGallery = useShots((s) => s.openGallery);

  useEffect(() => {
    read(serverId);
  }, [serverId, read]);

  const shots = state.status === "read" ? state.shots : [];
  const total = shots.reduce((sum, shot) => sum + shot.size_bytes, 0);

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <PageHeader
          actions={
            <>
              <Button
                icon={ExternalLink}
                onClick={() => openGallery(serverId)}
                size="sm"
              >
                Ouvrir la galerie
              </Button>
              <ConfirmButton
                confirmLabel="Vider"
                disabled={shots.length === 0}
                icon={Trash2}
                onConfirm={() => clean(serverId)}
                question="Les captures du serveur sont supprimées."
                size="sm"
              >
                Vider la galerie
              </ConfirmButton>
            </>
          }
          description="Ce que les agents ont capturé en travaillant. Les images restent sur le serveur."
          eyebrow="Serveur"
          title="Galerie"
        />

        {problem ? <ErrorNotice error={problem} /> : null}

        {state.status === "loading" ? (
          <WaitingNotice
            detail="Lecture du dossier des captures"
            title="Galerie"
          />
        ) : null}

        {state.status === "failed" ? (
          <ErrorNotice error={state.error} onRetry={() => read(serverId)} />
        ) : null}

        {state.status === "read" ? (
          <section className="flex flex-col gap-3">
            <p className="font-data text-[11px] text-ink-3">
              {shots.length === 0
                ? "Aucune capture"
                : `${plural(shots.length, "capture")} · ${weight(total)}`}
              {removed === null ? "" : ` · ${plural(removed, "supprimée")}`}
            </p>

            <div className="overflow-hidden rounded-md border border-line bg-surface">
              {shots.length === 0 ? (
                <EmptyState
                  detail="Un agent qui pilote un navigateur en dépose ici."
                  icon={ImageIcon}
                  title="La galerie est vide"
                />
              ) : (
                <div className="divide-y divide-line">
                  {shots.map((shot) => (
                    <ShotRow key={shot.path} shot={shot} />
                  ))}
                </div>
              )}
            </div>

            {cleaning ? (
              <WaitingNotice
                detail="Suppression des captures du serveur"
                title="Nettoyage"
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
