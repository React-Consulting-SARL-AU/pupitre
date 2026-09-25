import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useBackupConnection } from "@renderer/stores/backup-connection";
import { useConnections } from "@renderer/stores/connections";
import { useEffect, useState } from "react";
import { BackupConnectionForm } from "./backup-connection-form";
import { BackupConnectionHeld } from "./backup-connection-held";
import type { ConnectionDescriptor } from "./connection-descriptors";

export function BackupConnectionCard({
  connection,
}: {
  connection: ConnectionDescriptor;
}) {
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
      <BackupConnectionForm
        connection={connection}
        initial={view}
        onCancel={view ? () => setEditing(false) : undefined}
        onSaved={() => setEditing(false)}
      />
    </div>
  );
}
