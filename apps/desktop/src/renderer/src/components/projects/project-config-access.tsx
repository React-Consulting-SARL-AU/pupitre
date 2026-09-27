import type { Project } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  PROCESS_ACCESS,
  type ProcessAccess,
  type ProcessDraft,
} from "@renderer/lib/project-processes";
import { useAccess } from "@renderer/stores/access";
import type { Exposure } from "@renderer/stores/project-add";
import { useEffect } from "react";
import { AccessKeys } from "../access/access-keys";
import { Callout } from "../ui/callout";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { Select } from "../ui/select";
import { SwitchLine } from "../ui/switch";

export function ProjectConfigAccess({
  serverId,
  project,
  projects,
  processes,
  guarded,
  gated,
  exposure,
  onProtected,
  onProcessAccess,
}: {
  serverId: string;
  project: Project;
  projects: readonly Project[];
  processes: readonly ProcessDraft[];
  /** The project's protection as the draft holds it. */
  guarded: boolean;
  gated: boolean;
  exposure: Exposure | null;
  onProtected: (value: boolean) => void;
  onProcessAccess: (process: number, value: ProcessAccess) => void;
}) {
  const t = useTranslations();

  const read = useAccess((s) => s.read);

  useEffect(() => {
    if (gated) {
      read(serverId);
    }
  }, [gated, serverId, read]);

  const label: Record<ProcessAccess, string> = {
    project: t(
      guarded
        ? "access.processes.project.protected"
        : "access.processes.project.public"
    ),
    protected: t("access.processes.protected"),
    public: t("access.processes.public"),
  };

  const hostnamesOf = (id: string) =>
    project.processes
      .find((declared) => declared.id === id)
      ?.routes.flatMap((route) => route.hostname ?? []) ?? [];

  const opened = processes.some(
    (process) =>
      process.access === "public" || (process.access === "project" && !guarded)
  );

  return (
    <>
      {gated ? null : (
        <Callout name="access-agent-old" tone="warn">
          {t("access.agentTooOld")}
        </Callout>
      )}

      {gated && exposure === null ? (
        <Callout name="access-unexposed" tone="info">
          {t("access.unexposed")}
        </Callout>
      ) : null}

      <Section name="access-protection" title={t("access.protection.title")}>
        <Panel inset="lg">
          <SwitchLine
            checked={guarded}
            detail={t(
              guarded ? "access.protection.on" : "access.protection.off"
            )}
            disabled={!gated}
            label={t("access.protection.switch")}
            name="config.protected"
            onChange={onProtected}
          />
        </Panel>
      </Section>

      <Section name="access-processes" title={t("access.processes.title")}>
        <Panel as="ul" list>
          {processes.map((process, index) => {
            const hostnames = hostnamesOf(process.id);
            const name = `config.access.${process.key}`;

            return (
              <li
                className="flex items-center gap-4 px-5 py-3.5"
                data-process-access={process.id}
                key={process.key}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-data font-semibold text-control text-ink">
                    {process.id}
                  </span>
                  <span className="truncate font-data text-ink-3 text-small">
                    {hostnames.length > 0
                      ? hostnames.join(" · ")
                      : t("access.processes.noAddress")}
                  </span>
                </span>

                <div className="w-60 shrink-0">
                  <Select
                    aria-label={t("access.processes.label", {
                      id: process.id,
                    })}
                    disabled={!gated}
                    id={name}
                    name={name}
                    onChange={(next) => onProcessAccess(index, next)}
                    options={PROCESS_ACCESS.map((value) => ({
                      label: label[value],
                      value,
                    }))}
                    value={process.access}
                  />
                </div>
              </li>
            );
          })}
        </Panel>

        {opened ? (
          <p className="text-ink-3 text-small leading-relaxed">
            {t("access.processes.publicHelp")}
          </p>
        ) : null}
      </Section>

      {gated ? (
        <AccessKeys
          project={project.name}
          projects={projects}
          serverId={serverId}
          title={t("access.keys.projectTitle", { name: project.name })}
        />
      ) : null}
    </>
  );
}
