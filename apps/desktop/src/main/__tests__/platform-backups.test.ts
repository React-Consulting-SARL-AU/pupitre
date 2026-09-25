import { describe, expect, it } from "bun:test";
import { createPlatformClient } from "../platform-client";

/**
 * The backups the platform lists, and the restore it notes: the routes and
 * the bodies the contract names, and nothing of a backup's content.
 */

interface Seen {
  url: string;
  method: string;
  body: string | null;
}

function recording(body: unknown, status = 200) {
  const seen: Seen[] = [];
  const fetcher = ((input: string, init?: RequestInit) => {
    seen.push({
      body: typeof init?.body === "string" ? init.body : null,
      method: init?.method ?? "GET",
      url: String(input),
    });

    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            headers: { "content-type": "application/json" },
            status,
          })
    );
  }) as unknown as typeof fetch;

  return {
    platform: createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: fetcher,
    }),
    seen,
  };
}

const BACKUP = {
  agent_version: "1.2.3",
  bytes: 133,
  config_revision: 3,
  counts: { databases: 1, home: true, paths: 0, projects: 1, setup: true },
  created_at: "2026-09-19T03:15:00.000Z",
  id: "20260919T031500Z-7f3a2c",
  kdf_salt: "A".repeat(22).concat("=="),
  location: {
    bucket: "backups",
    endpoint: "https://s3.example.org",
    key: "pupitre/srv-1/20260919T031500Z-7f3a2c",
    path_style: false,
    region: "auto",
    sha256: "a".repeat(64),
  },
  recipient: "A".repeat(43).concat("="),
  server_id: "srv-1",
  server_name: "vps",
  trigger: "schedule",
};

describe("les sauvegardes sur la plateforme", () => {
  it("liste celles de l'organisation, puis celles d'un serveur", async () => {
    const { platform, seen } = recording({ data: [BACKUP] });

    const all = await platform.backups("jeton");
    await platform.backups("jeton", "srv-1");

    expect(all).toEqual({ ok: true, result: [BACKUP] as never });
    expect(seen.map((one) => one.url)).toEqual([
      "https://app.pupitre.studio/api/v1/backups",
      "https://app.pupitre.studio/api/v1/servers/srv-1/backups",
    ]);
  });

  it("refuse une liste qu'elle ne sait pas lire plutôt que de la croire", async () => {
    const { platform } = recording({ data: [{ id: "b-1" }] });

    const all = await platform.backups("jeton");

    expect(all).toMatchObject({
      error: { code: "internal", message: "refusal.platform.unreadable" },
      ok: false,
    });
  });

  it("note une restauration avec le serveur qui l'a reçue", async () => {
    const { platform, seen } = recording(null, 204);

    const answer = await platform.backupRestored(
      "jeton",
      "20260919T031500Z-7f3a2c",
      "srv-1"
    );

    expect(answer).toEqual({ ok: true, result: null });
    expect(seen).toEqual([
      {
        body: JSON.stringify({ server_id: "srv-1" }),
        method: "POST",
        url: "https://app.pupitre.studio/api/v1/backups/20260919T031500Z-7f3a2c/restored",
      },
    ]);
  });
});
