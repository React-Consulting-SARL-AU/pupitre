import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Link2 } from "lucide-react";
import { ServiceCredentialRow } from "./service-credential-row";

/**
 * What opens this service, named by the agent and hidden by the app.
 *
 * A database also carries its connection string, asked for on demand and filed
 * with the rest: it is a credential like the others, and it is masked like the
 * others. A module that names none has no section: an empty one would only say
 * what the page already shows by not showing it.
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

  if (labels.length === 0 && !database) {
    return null;
  }

  return (
    <Section
      actions={
        database ? (
          <Button
            icon={Link2}
            loading={loading}
            onClick={onConnectionUrl}
            size="sm"
          >
            {t("services.credentials.connectionUrl")}
          </Button>
        ) : null
      }
      name="credentials"
      title={t("services.credentials.title")}
    >
      {labels.length > 0 ? (
        <Panel as="ul" list>
          {labels.map((label) => (
            <ServiceCredentialRow
              key={label}
              label={label}
              onCopy={() => onCopy(label)}
              onReveal={() => onReveal(label)}
            />
          ))}
        </Panel>
      ) : null}
    </Section>
  );
}
