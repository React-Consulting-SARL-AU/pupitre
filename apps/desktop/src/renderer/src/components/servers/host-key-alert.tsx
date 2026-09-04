import { ShieldAlert } from "lucide-react";
import type { HostKeyState } from "../../stores/servers";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

/**
 * The refusal, and the only two ways out of it.
 *
 * Both fingerprints are shown side by side because that is what lets someone
 * with access to the machine settle the question in ten seconds. Nothing here
 * offers to "continue anyway": the app cannot tell a reinstallation from an
 * impostor, so it asks rather than guesses.
 */
export function HostKeyAlert({
  state,
  serverName,
  busy,
  onReinstalled,
  onCancel,
}: {
  state: Extract<HostKeyState, { status: "changed" }>;
  serverName: string;
  busy: boolean;
  onReinstalled: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="elevation-raised animate-[fade-in_200ms_ease-out] rounded-md border border-danger/40 bg-danger/10 p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 shrink-0 text-danger"
          size={16}
          strokeWidth={1.5}
        />

        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-danger">
            Connexion refusée à {serverName}
          </h3>
          <p className="mt-1.5 text-ink-2 leading-relaxed">{state.message}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Fingerprint label="Empreinte attendue" value={state.expected} />
            <Fingerprint
              label="Empreinte présentée"
              value={
                state.observed ?? "aucune : l'empreinte épinglée a disparu"
              }
            />
          </div>

          <p className="mt-5 font-medium text-ink leading-relaxed">
            {state.fix}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button loading={busy} onClick={onReinstalled} variant="danger">
              J'ai réinstallé ce serveur
            </Button>
            <Button onClick={onCancel} variant="discreet">
              Annuler
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fingerprint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <p className="mt-1 break-all font-data text-[11px] text-ink-2 leading-relaxed">
        {value}
      </p>
    </div>
  );
}
