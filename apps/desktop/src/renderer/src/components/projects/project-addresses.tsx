import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Copy, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";

const COPY_MS = 1600;

interface Line {
  label: string;
  host: string;
  port: number;
  hostname?: string;
}

function linesOf(project: Project, mainLabel: string): Line[] {
  const several = project.processes.length > 1;

  return project.processes.flatMap((process) => {
    const routes =
      process.routes.length > 0
        ? process.routes
        : [{ label: mainLabel, port: process.port }];

    return routes.map((route) => ({
      host: process.host,
      label: several ? `${process.id}/${route.label}` : route.label,
      port: route.port,
      ...("hostname" in route && route.hostname
        ? { hostname: route.hostname }
        : {}),
    }));
  });
}

export function ProjectAddresses({
  project,
  onPublish,
}: {
  project: Project;
  onPublish: () => void;
}) {
  const t = useTranslations();

  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string) {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), COPY_MS);
  }

  const lines = linesOf(project, t("project.addresses.mainLabel"));

  return (
    <Section
      actions={
        <Button icon={Plus} onClick={onPublish} size="sm">
          {t("project.addresses.publishAnother")}
        </Button>
      }
      name="addresses"
      title={t("project.addresses.title")}
    >
      <Panel
        as="ul"
        className="flex flex-col gap-1.5"
        data-addresses={lines.length}
      >
        {lines.map((route) => {
          const url = route.hostname ? `https://${route.hostname}` : null;
          const shown = url
            ? url.replace("https://", "")
            : `${route.host}:${route.port}`;

          return (
            <li
              className="flex items-center gap-2"
              data-published={url ? "true" : "false"}
              key={`${route.label}-${route.port}`}
            >
              <span className="w-20 shrink-0 truncate font-data text-caption text-ink-4 uppercase">
                {route.label}
              </span>

              {url ? (
                <button
                  className="min-w-0 flex-1 truncate text-left font-data text-control text-ink hover:underline"
                  onClick={() => window.pupitre.openUrl(url)}
                  type="button"
                >
                  {shown}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate font-data text-control text-ink-3">
                  {shown}
                </span>
              )}

              {url ? (
                <IconButton
                  icon={ExternalLink}
                  label={t("project.addresses.open", { hostname: shown })}
                  onClick={() => window.pupitre.openUrl(url)}
                  variant="discreet"
                />
              ) : null}

              <IconButton
                icon={copied === (url ?? shown) ? Check : Copy}
                label={
                  copied === (url ?? shown)
                    ? t("project.overview.addressCopied")
                    : t("project.overview.copyAddress")
                }
                onClick={() => copy(url ?? shown)}
                variant="discreet"
              />
            </li>
          );
        })}
      </Panel>
    </Section>
  );
}
