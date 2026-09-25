import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Link2 } from "lucide-react";
import { ServiceCredentialRow } from "./service-credential-row";

export function ServiceCredentials({
  labels,
  database,
  loading = false,
  onReveal,
  onCopy,
  onConnectionUrl,
}: {
  labels: readonly string[];
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
