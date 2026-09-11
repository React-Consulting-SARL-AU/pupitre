import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Copy, ExternalLink, Globe, Plus } from "lucide-react";
import { useState } from "react";
import { ProjectPanel } from "./project-panel";

const COPY_MS = 1600;

/**
 * Every address a project answers on: one line per port.
 *
 * A port with a name on the web opens and copies as `https://<name>`; a port
 * without one shows where it listens on the machine, which is reached through
 * the app's SSH session and nowhere else. Publishing another port is a gesture
 * to the configuration, where the ports live.
 */
export function ProjectAddresses({
  project,
  onPublish,
}: {
  project: Project;
  /** Opens the configuration on the ports: that is where a port gets its name. */
  onPublish: () => void;
}) {
  const t = useTranslations();

  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string) {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), COPY_MS);
  }

  const lines =
    project.routes.length > 0
      ? project.routes
      : [{ label: t("project.addresses.mainLabel"), port: project.port }];

  return (
    <ProjectPanel icon={Globe} label={t("project.addresses.title")}>
      <ul className="flex flex-col gap-1.5" data-addresses={lines.length}>
        {lines.map((route) => {
          const url =
            "hostname" in route && route.hostname
              ? `https://${route.hostname}`
              : null;
          const shown = url
            ? url.replace("https://", "")
            : `${project.host}:${route.port}`;

          return (
            <li
              className="flex items-center gap-2"
              data-published={url ? "true" : "false"}
              key={`${route.label}-${route.port}`}
            >
              <span className="w-14 shrink-0 truncate font-data text-[11px] text-ink-4 uppercase">
                {route.label}
              </span>

              {url ? (
                <button
                  className="min-w-0 flex-1 truncate text-left font-data text-[13px] text-ink hover:underline"
                  onClick={() => window.pupitre.openUrl(url)}
                  type="button"
                >
                  {shown}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate font-data text-[13px] text-ink-3">
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
      </ul>

      <div className="mt-3">
        <Button icon={Plus} onClick={onPublish} size="sm">
          {t("project.addresses.publishAnother")}
        </Button>
      </div>
    </ProjectPanel>
  );
}
