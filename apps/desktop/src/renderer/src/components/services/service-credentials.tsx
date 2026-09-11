import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
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
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>{t("services.credentials.title")}</Label>

        {database ? (
          <Button
            icon={Link2}
            loading={loading}
            onClick={onConnectionUrl}
            size="sm"
          >
            {t("services.credentials.connectionUrl")}
          </Button>
        ) : null}
      </div>

      {labels.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          {t("services.credentials.empty")}
        </p>
      ) : (
        <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
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
    </section>
  );
}
