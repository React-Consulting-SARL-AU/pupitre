import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { StatePill } from "@renderer/components/ui/state-pill";
import type { StateLook } from "@renderer/lib/project-state";
import { RefreshCw, RotateCw } from "lucide-react";

/**
 * The tunnel of the agent: what it publishes, and the two gestures it accepts.
 *
 * The routes are the agent's own list. A server without the module says so and
 * offers nothing: the catalogue is where a tunnel is added, not here.
 */

const LOOK: Record<TunnelStatusResult["state"], StateLook> = {
  absent: {
    frame: "border-line-strong",
    label: "absent",
    shape: "empty",
    tone: "neutral",
  },
  failed: {
    frame: "border-danger/40",
    label: "en échec",
    shape: "struck",
    tone: "danger",
  },
  running: {
    frame: "border-ok/40",
    label: "actif",
    shape: "filled",
    tone: "ok",
  },
  stopped: {
    frame: "border-line-strong",
    label: "arrêté",
    shape: "empty",
    tone: "neutral",
  },
};

export function ServicesTunnel({
  tunnel,
  busy,
  onSync,
  onRestart,
}: {
  tunnel: TunnelStatusResult;
  busy: string | null;
  onSync: () => void;
  onRestart: () => void;
}) {
  if (!tunnel.installed) {
    return (
      <section className="flex flex-col gap-2" data-tunnel="absent">
        <Label>Tunnel</Label>
        <p className="text-[11px] text-ink-3">
          Aucun module d'exposition sur ce serveur : les projets restent
          joignables par la session SSH de l'app.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3" data-tunnel={tunnel.state}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <Label>Tunnel</Label>
          <StatePill look={LOOK[tunnel.state]} name={tunnel.state} />
        </span>

        <span className="flex items-center gap-2">
          <Button
            icon={RefreshCw}
            loading={busy === "tunnel.sync"}
            onClick={onSync}
            size="sm"
          >
            Synchroniser les routes
          </Button>
          <Button
            icon={RotateCw}
            loading={busy === "tunnel.restart"}
            onClick={onRestart}
            size="sm"
          >
            Redémarrer
          </Button>
        </span>
      </div>

      {tunnel.routes.length === 0 ? (
        <p className="text-[11px] text-ink-3">
          Aucune route : aucun projet n'a encore de sous-domaine.
        </p>
      ) : (
        <ul className="elevation-raised divide-y divide-line rounded-md border border-line bg-surface">
          {tunnel.routes.map((route) => (
            <li
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-route={route.hostname}
              key={route.hostname}
            >
              <code className="min-w-0 flex-1 truncate font-data text-[11px] text-ink">
                {route.hostname}
              </code>
              <code className="font-data text-[11px] text-ink-3">
                {route.service}
              </code>
              {route.project ? (
                <span className="text-[11px] text-ink-3">{route.project}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
