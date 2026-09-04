import type { ConnectionState } from "@shared/contract";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { StatusDot } from "./ui/status-dot";

/**
 * What shows when the connection does not answer.
 *
 * This is the first screen of a fresh install, so it has to stand on its own:
 * every check carries its own remedy, and the way out is the servers screen —
 * never a file for the user to edit by hand. The app owns its SSH
 * configuration, so sending someone to write in ~/.ssh/config would be both
 * useless and a promise broken.
 */
export function ConnectionSetup({
  connection,
  onRetry,
  onSettings,
}: {
  connection: ConnectionState;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const failing = connection.diagnostics.some((d) => !d.ok);
  const nothingYet = connection.host === "";

  return (
    <div className="grid h-full place-items-center px-8">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <Label>Connexion</Label>
        </div>

        <h1 className="mt-3 font-semibold text-2xl text-ink tracking-tight">
          {nothingYet
            ? "Aucun serveur pour l'instant"
            : "Le serveur ne répond pas"}
        </h1>

        <p className="mt-2 text-ink-3 leading-relaxed">
          {nothingYet
            ? "L'app parle à votre serveur en SSH, avec une configuration et une clé qui lui sont propres. Votre ~/.ssh/config n'est jamais modifié."
            : "Voici où cela bloque, et ce qui répare."}
        </p>

        <div className="elevation-raised mt-8 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {connection.diagnostics.map((d) => (
            <div className="flex gap-3 px-4 py-3" key={d.step}>
              <span className="mt-1 shrink-0">
                <StatusDot
                  label={d.ok ? "réussi" : "échoué"}
                  shape={d.ok ? "filled" : "struck"}
                  tone={d.ok ? "ok" : "danger"}
                />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink">{d.title}</p>
                <p className="break-all font-data text-[11px] text-ink-3">
                  {d.detail}
                </p>
                {d.ok ? null : (
                  <p className="mt-1 font-medium text-[12px] text-ink leading-relaxed">
                    {d.fix}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button onClick={onSettings} variant="inverse">
            {nothingYet ? "Ajouter un serveur" : "Gérer les serveurs"}
          </Button>
          <Button onClick={onRetry}>Réessayer</Button>
        </div>

        {failing ? null : (
          <p className="mt-5 font-data text-[11px] text-ink-3">
            toutes les vérifications passent — la connexion devrait s'ouvrir
          </p>
        )}
      </div>
    </div>
  );
}
