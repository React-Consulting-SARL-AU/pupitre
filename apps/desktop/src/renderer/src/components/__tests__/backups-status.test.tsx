import { describe, expect, it } from "bun:test";
import type { StatusState } from "@renderer/stores/backups";
import { renderToStaticMarkup } from "react-dom/server";
import { BackupsStatus } from "../backups/backups-status";

const LAST_RUN = "2026-09-24T03:00:00Z";

function stateWith(warnings?: string[]): StatusState {
  return {
    status: "read",
    serverId: "srv_1",
    backup: {
      configured: true,
      interval_hours: 24,
      keep: 14,
      running: false,
      last: {
        at: LAST_RUN,
        ok: true,
        id: "20260924T030000Z-7f3a2c",
        bytes: 18_842,
        ...(warnings ? { warnings } : {}),
      },
    },
  };
}

function render(state: StatusState): string {
  return renderToStaticMarkup(
    <BackupsStatus
      docker={false}
      onRetry={async () => undefined}
      state={state}
    />
  );
}

describe("the backup status", () => {
  it("names each part the last backup left behind", () => {
    const html = render(
      stateWith(["db:postgres:shop : pg_dump a refusé la base shop"])
    );

    expect(html).toContain('data-callout="backup-incomplete"');
    expect(html).toContain("pg_dump a refusé la base shop");
  });

  it("stays silent on a complete backup", () => {
    expect(render(stateWith())).not.toContain("backup-incomplete");
  });
});
