import { InstallLog } from "@renderer/components/install/install-log";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import type { UpdateState, UpgradeState } from "@renderer/stores/agent-update";
import { ArrowUp } from "lucide-react";
import { AgentUpdateFrame } from "./agent-update-frame";
import { AgentUpdateNotes } from "./agent-update-notes";

/**
 * The gap between the agent this app carries and the one the server runs.
 *
 * Ahead, it offers the update and the notes that came with it. Behind, it says
 * so and stops there: the server runs a newer agent, everything this app still
 * knows how to ask goes on working, and barring the screens over a version
 * number would break the app rather than the mismatch.
 */
export function AgentUpdateBanner({
  state,
  upgrade,
  journal,
  onUpgrade,
  onHide,
}: {
  state: UpdateState;
  upgrade: UpgradeState;
  journal: readonly string[];
  onUpgrade: () => void;
  onHide: () => void;
}) {
  if (state.status !== "ready") {
    return null;
  }

  const { carried, installed, order } = state.update;

  if (order === "behind") {
    return (
      <AgentUpdateFrame
        detail={`pupitred ${installed ?? "?"} sur le serveur, ${carried?.version ?? "?"} dans cette app`}
        onHide={onHide}
        order={order}
        title="Mettez l'app à jour"
      >
        <Callout>
          Ce serveur est passé à une version que cette app ne connaît pas
          encore. Tout ce qu'elle sait demander continue de fonctionner.
        </Callout>
      </AgentUpdateFrame>
    );
  }

  if (!(order === "ahead" && carried)) {
    return null;
  }

  return (
    <AgentUpdateFrame
      detail={`pupitred ${installed ?? "?"} → ${carried.version} · ${carried.arch}`}
      onHide={onHide}
      order={order}
      title="Mise à jour disponible"
    >
      <AgentUpdateNotes notes={carried.notes} />

      {carried.signed ? null : (
        <Callout
          fix="bun --cwd=apps/agent run release, puis reconstruis l'app."
          tone="warn"
        >
          Cette app ne porte pas la signature de cette version : l'agent
          refuserait la mise à jour.
        </Callout>
      )}

      {upgrade.status === "failed" ? (
        <ErrorNotice error={upgrade.error} onRetry={onUpgrade} />
      ) : null}

      {upgrade.status === "done" ? (
        <Callout>
          {`Agent ${upgrade.result.previous_version} remplacé par ${upgrade.result.version}${
            upgrade.result.restarting ? ", service redémarré." : "."
          }`}
        </Callout>
      ) : null}

      <InstallLog lines={journal} />

      <div className="flex justify-end">
        <Button
          disabled={!carried.signed}
          icon={ArrowUp}
          loading={upgrade.status === "running"}
          onClick={onUpgrade}
          variant="inverse"
        >
          Mettre l'agent à jour
        </Button>
      </div>
    </AgentUpdateFrame>
  );
}
