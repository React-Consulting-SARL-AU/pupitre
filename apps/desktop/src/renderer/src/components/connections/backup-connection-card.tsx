import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useBackupConnection } from "@renderer/stores/backup-connection";
import { useConnections } from "@renderer/stores/connections";
import { useEffect, useState } from "react";
import { BackupConnectionForm } from "./backup-connection-form";
import { BackupConnectionHeld } from "./backup-connection-held";
import type { ConnectionDescriptor } from "./connection-descriptors";

/**
 * The backup connection, wherever an account is asked for: the preferences,
 * the configuration of a module, a server's backups. Held, it says where
 * backups go; otherwise, or when the reader edits it, it is the form.
 */
export function BackupConnectionCard({
  connection,
  compact = false,
}: {
  connection: ConnectionDescriptor;
  compact?: boolean;
}) {
  const t = useTranslations();

  const held = useBackupConnection((store) => store.held);
  const read = useBackupConnection((store) => store.read);
  const forget = useBackupConnection((store) => store.forget);
  const state = useConnections((store) => store.state.backup);

  const [editing, setEditing] = useState(false);

  useEffect(() => {
    read();
  }, [read]);

  if (held.status !== "read") {
    return <SkeletonRows rows={2} />;
  }

  const view = held.view;

  if (view && !editing) {
    return (
      <BackupConnectionHeld
        onEdit={() => setEditing(true)}
        onForget={forget}
        unsealed={state.status === "connected" && !state.sealed}
        view={view}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-connection="backup">
      {compact || view ? null : (
        <p className="text-ink-3 leading-relaxed">{t(connection.intro)}</p>
      )}

      <BackupConnectionForm
        connection={connection}
        initial={view}
        onCancel={view ? () => setEditing(false) : undefined}
        onSaved={() => setEditing(false)}
      />
    </div>
  );
}
