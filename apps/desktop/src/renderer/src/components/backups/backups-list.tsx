import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ListState } from "@renderer/stores/backups";
import type { AgentError } from "@shared/agent";
import type { PlatformBackup } from "@shared/backups";
import { Archive } from "lucide-react";
import { BackupsRow } from "./backups-row";

export function BackupsList({
  list,
  busy,
  problem,
  onRetry,
  onRevert,
  onRemove,
}: {
  list: ListState;
  busy: boolean;
  problem: AgentError | null;
  onRetry: () => Promise<void>;
  onRevert: (backup: PlatformBackup) => void;
  onRemove: (backup: PlatformBackup) => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <Section name="backup-list" title={t("backups.list.title")}>
      {list.status === "loading" || list.status === "idle" ? (
        <SkeletonRows framed rows={3} />
      ) : null}

      {list.status === "failed" ? (
        <ErrorNotice error={list.error} onRetry={onRetry} />
      ) : null}

      {problem ? <ErrorNotice error={problem} /> : null}

      {list.status === "read" && list.backups.length === 0 ? (
        <EmptyState icon={Archive} title={t("backups.list.empty")} />
      ) : null}

      {list.status === "read" && list.backups.length > 0 ? (
        <Panel as="ul" list>
          {list.backups.map((backup) => (
            <BackupsRow
              backup={backup}
              busy={busy}
              key={backup.id}
              onRemove={() => onRemove(backup)}
              onRevert={() => onRevert(backup)}
            />
          ))}
        </Panel>
      ) : null}
    </Section>
  );
}
