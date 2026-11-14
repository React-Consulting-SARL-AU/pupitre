import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { addressLines } from "@renderer/lib/project-addresses";
import type { Gesture } from "@renderer/lib/use-pending";
import type { AgentError } from "@shared/agent";
import type { PortForward } from "@shared/services";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../ui/error-notice";
import { ProjectAddressRow } from "./project-address-row";

const COPY_MS = 1600;

export function ProjectAddresses({
  project,
  forwards,
  problem,
  onPublish,
  onReach,
  onCloseForward,
  onKeepForward,
  onTurnAccess,
}: {
  project: Project;
  /** This server's forwards on the owner's computer. */
  forwards: readonly PortForward[];
  problem: AgentError | null;
  onPublish: () => void;
  onReach: Gesture<[number, string]>;
  onCloseForward: Gesture<[string]>;
  onKeepForward: Gesture<[string, boolean]>;
  onTurnAccess: (process: string) => Promise<void>;
}) {
  const t = useTranslations();

  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string) {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), COPY_MS);
  }

  const lines = addressLines(project, t("project.addresses.mainLabel"));

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
        {lines.map((line) => {
          const forward =
            forwards.find((held) => held.remotePort === line.port) ?? null;

          return (
            <ProjectAddressRow
              copied={copied}
              forward={forward}
              key={`${line.label}-${line.port}`}
              line={line}
              onCloseForward={() => forward && onCloseForward(forward.id)}
              onCopy={copy}
              onKeepForward={(keep) =>
                forward && onKeepForward(forward.id, keep)
              }
              onReach={() => onReach(line.port, line.process)}
              onTurnAccess={() => onTurnAccess(line.process)}
            />
          );
        })}
      </Panel>

      {problem ? <ErrorNotice error={problem} name="forward" /> : null}
    </Section>
  );
}
