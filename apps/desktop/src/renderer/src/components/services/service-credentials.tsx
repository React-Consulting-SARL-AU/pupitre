import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { Link2 } from "lucide-react";
import { ServiceCredentialRow } from "./service-credential-row";

/**
 * What opens this service, named by the agent and hidden by the app.
 *
 * A database also carries its connection string, asked for on demand and filed
 * with the rest: it is a credential like the others, and it is masked like the
 * others.
 */
export function ServiceCredentials({
  labels,
  database,
  loading = false,
  onReveal,
  onCopy,
  onConnectionUrl,
}: {
  labels: readonly string[];
  /** Whether this module is a database, and so has a connection string. */
  database: boolean;
  loading?: boolean;
  onReveal: (label: string) => Promise<string | null>;
  onCopy: (label: string) => Promise<boolean>;
  onConnectionUrl?: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>Identifiants</Label>

        {database ? (
          <Button
            icon={Link2}
            loading={loading}
            onClick={onConnectionUrl}
            size="sm"
          >
            Demander l'URL de connexion
          </Button>
        ) : null}
      </div>

      {labels.length === 0 ? (
        <p className="text-[11px] text-ink-3">
          Ce module ne déclare aucun identifiant.
        </p>
      ) : (
        <ul className="elevation-raised divide-y divide-line rounded-md border border-line bg-surface">
          {labels.map((label) => (
            <ServiceCredentialRow
              key={label}
              label={label}
              onCopy={() => onCopy(label)}
              onReveal={() => onReveal(label)}
            />
          ))}
        </ul>
      )}

      <p className="text-[11px] text-ink-4 leading-relaxed">
        Les valeurs restent dans le processus principal : elles ne sont ni
        enregistrées, ni journalisées, et le presse-papiers est écrit de ce
        côté-là.
      </p>
    </section>
  );
}
