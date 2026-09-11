import { describe, expect, it } from "bun:test";
import { saveShot } from "../shots-run";

/**
 * The write is the one thing the window may not do on its own: it names a
 * path only by handing back the one the dialog returned. Everything else is
 * refused before a byte is written.
 */

const PICKED = "/Users/ada/Downloads/accueil.png";

function harness(
  picked: string[],
  write: (path: string, bytes: Uint8Array) => Promise<void> = () =>
    Promise.resolve()
) {
  const written: { path: string; bytes: Uint8Array }[] = [];

  return {
    deps: {
      picked: (path: unknown): path is string =>
        typeof path === "string" && picked.includes(path),
      write: (path: string, bytes: Uint8Array) => {
        written.push({ bytes, path });

        return write(path, bytes);
      },
    },
    written,
  };
}

describe("l'enregistrement d'une capture", () => {
  it("écrit les octets là où la boîte a pointé", async () => {
    const { deps, written } = harness([PICKED]);

    const answer = await saveShot(PICKED, new Uint8Array([1, 2, 3]), deps);

    expect(answer).toEqual({ ok: true, result: { path: PICKED } });
    expect(written).toHaveLength(1);
    expect([...(written[0]?.bytes ?? [])]).toEqual([1, 2, 3]);
  });

  it("refuse un chemin que la boîte n'a pas rendu, quel qu'il soit", async () => {
    const { deps, written } = harness([PICKED]);

    for (const path of ["/etc/passwd", "/Users/ada/Downloads/autre.png", 42]) {
      const answer = await saveShot(path, new Uint8Array([1]), deps);

      expect(answer).toMatchObject({
        error: {
          code: "bad_request",
          phrase: { id: "refusal.shots.savePath" },
        },
        ok: false,
      });
    }

    expect(written).toHaveLength(0);
  });

  it("refuse ce qui n'est pas des octets, ou n'en a aucun", async () => {
    const { deps, written } = harness([PICKED]);

    for (const bytes of ["texte", new Uint8Array(0), null]) {
      const answer = await saveShot(PICKED, bytes, deps);

      expect(answer).toMatchObject({
        error: { phrase: { id: "refusal.shots.saveBytes" } },
        ok: false,
      });
    }

    expect(written).toHaveLength(0);
  });

  it("dit pourquoi le disque a refusé, avec le chemin", async () => {
    const { deps } = harness([PICKED], () =>
      Promise.reject(new Error("EACCES: permission denied"))
    );

    const answer = await saveShot(PICKED, new Uint8Array([1]), deps);

    expect(answer).toMatchObject({
      error: {
        code: "internal",
        phrase: {
          id: "refusal.shots.saveFailed",
          values: { path: PICKED, reason: "EACCES: permission denied" },
        },
      },
      ok: false,
    });
  });
});
