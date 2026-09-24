import { beforeEach, describe, expect, it } from "bun:test";
import type { BackupConnectionInput } from "@shared/backups";
import { NO_CONNECTIONS } from "@shared/connections";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useBackupConnection } from "../backup-connection";
import { useConnections } from "../connections";

const STORAGE = {
  access_key_id: "AKIA-E2E",
  bucket: "pupitre-backups",
  endpoint: "https://acme.r2.cloudflarestorage.com",
  path_style: true,
  prefix: "pupitre",
  region: "auto",
};

const VIEW = {
  ...STORAGE,
  kdf_salt: "AAECAwQFBgcICQoLDA0ODw==",
  recipient: "A".repeat(43).concat("="),
};

beforeEach(() => {
  useBackupConnection.setState({
    held: { status: "idle" },
    identity: { status: "idle" },
    problem: null,
    saving: false,
  });
});

describe("la connexion des sauvegardes", () => {
  it("lit ce que l'ordinateur tient et l'identité de l'organisation", async () => {
    stubPupitre({
      backupConnection: () => Promise.resolve(null),
      backupIdentity: () =>
        Promise.resolve({
          ok: true,
          result: {
            created_at: "2026-09-19T03:15:00Z",
            kdf_salt: VIEW.kdf_salt,
            recipient: VIEW.recipient,
            server_name: "atelier",
          },
        }),
    });

    await useBackupConnection.getState().read();

    expect(useBackupConnection.getState()).toMatchObject({
      held: { status: "read", view: null },
      identity: { identity: { server_name: "atelier" }, status: "read" },
    });
  });

  it("envoie la phrase une fois, ne garde que ce que le main a gardé", async () => {
    let sent: BackupConnectionInput | null = null;

    stubPupitre({
      connectBackup: (input) => {
        sent = input;

        return Promise.resolve({ ok: true, result: VIEW });
      },
      connectionsState: () =>
        Promise.resolve({
          ...NO_CONNECTIONS,
          backup: {
            account: { id: "pupitre-backups", name: "pupitre-backups" },
            sealed: true,
            status: "connected",
          },
        }),
    });

    const kept = await useBackupConnection.getState().save({
      ...STORAGE,
      passphrase: "une phrase de passe assez longue",
      secret_access_key: "s3-secret",
    });

    expect(kept).toBe(true);
    expect(sent).toMatchObject({
      passphrase: "une phrase de passe assez longue",
    });
    expect(JSON.stringify(useBackupConnection.getState())).not.toContain(
      "une phrase de passe assez longue"
    );
    expect(useConnections.getState().holds("backup")).toBe(true);
  });

  it("garde le refus du main pour le formulaire", async () => {
    stubPupitre({
      connectBackup: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "refusal.backup.passphrase.none",
            phrase: { id: "refusal.backup.passphrase.none" },
          },
          ok: false,
        }),
    });

    const kept = await useBackupConnection.getState().save(STORAGE);

    expect(kept).toBe(false);
    expect(useBackupConnection.getState().problem?.phrase?.id).toBe(
      "refusal.backup.passphrase.none"
    );
  });
});
