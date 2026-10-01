import { describe, expect, it } from "bun:test";
import { saveShot } from "../shots-run";

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

describe("saving a capture", () => {
  it("writes the bytes where the dialog pointed", async () => {
    const { deps, written } = harness([PICKED]);

    const answer = await saveShot(PICKED, new Uint8Array([1, 2, 3]), deps);

    expect(answer).toEqual({ ok: true, result: { path: PICKED } });
    expect(written).toHaveLength(1);
    expect([...(written[0]?.bytes ?? [])]).toEqual([1, 2, 3]);
  });

  it("refuses any path the dialog did not return", async () => {
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

  it("refuses what is not bytes, or has none", async () => {
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

  it("says why the disk refused, with the path", async () => {
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
