import type { AccessKey } from "@pupitre/shared/agent-protocol/access";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { hostnamesOpenedBy } from "@renderer/lib/access";
import { opens, useAccess } from "@renderer/stores/access";
import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice } from "../ui/error-notice";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { SkeletonRows } from "../ui/skeleton";
import { AccessCopied } from "./access-copied";
import { AccessKeyCreateDialog } from "./access-key-create-dialog";
import { AccessKeyRow } from "./access-key-row";

export function AccessKeys({
  serverId,
  projects,
  project,
  title,
}: {
  serverId: string;
  projects: readonly Project[];
  /** Narrows the list to the keys that open it, and the dialog to it. */
  project: string | null;
  title: string;
}) {
  const t = useTranslations();

  const state = useAccess((s) => s.state);
  const gesture = useAccess((s) => s.gesture);
  const read = useAccess((s) => s.read);
  const create = useAccess((s) => s.create);
  const copy = useAccess((s) => s.copy);
  const revoke = useAccess((s) => s.revoke);
  const settle = useAccess((s) => s.settle);

  const [creating, setCreating] = useState(false);

  const hostnamesFor = (key: AccessKey) => hostnamesOpenedBy(key, projects);

  const keys =
    state.status === "read"
      ? state.keys.filter((key) => project === null || opens(key, project))
      : [];

  const lastCopied =
    !creating && gesture.status !== "idle" && gesture.id !== null
      ? gesture.id
      : null;

  return (
    <Section
      actions={
        <Button
          disabled={state.status !== "read"}
          icon={Plus}
          onClick={() => {
            settle();
            setCreating(true);
          }}
          size="sm"
        >
          {t("access.keys.new")}
        </Button>
      }
      aside={
        keys.length > 0 ? (
          <span className="font-data text-ink-3 text-small tabular-nums">
            {keys.length}
          </span>
        ) : undefined
      }
      name="access-keys"
      title={title}
    >
      {state.status === "loading" || state.status === "idle" ? (
        <SkeletonRows framed rows={2} />
      ) : null}

      {state.status === "failed" ? (
        <ErrorNotice error={state.error} onRetry={() => read(serverId)} />
      ) : null}

      {state.status === "read" && keys.length === 0 ? (
        <Panel inset="lg">
          <EmptyState
            detail={t("access.keys.noneDetail")}
            icon={KeyRound}
            title={t("access.keys.none")}
          />
        </Panel>
      ) : null}

      {state.status === "read" && keys.length > 0 ? (
        <Panel as="ul" data-access-keys={keys.length} list>
          {keys.map((key) => (
            <AccessKeyRow
              accessKey={key}
              device={state.held.device === key.id}
              held={state.held.held.includes(key.id)}
              hostnames={hostnamesFor(key)}
              key={key.id}
              onCopy={(form, hostname) =>
                copy(serverId, key.id, form, hostname)
              }
              onRevoke={() => revoke(serverId, key.id)}
            />
          ))}
        </Panel>
      ) : null}

      {lastCopied ? <AccessCopied gesture={gesture} id={lastCopied} /> : null}

      {creating ? (
        <AccessKeyCreateDialog
          gesture={gesture}
          hostnamesFor={hostnamesFor}
          onClose={() => {
            settle();
            setCreating(false);
          }}
          onCopy={(key, form, hostname) =>
            copy(serverId, key.id, form, hostname)
          }
          onCreate={(name, scope) => create(serverId, name, scope)}
          project={project}
          projects={projects.map((held) => held.name)}
        />
      ) : null}
    </Section>
  );
}
