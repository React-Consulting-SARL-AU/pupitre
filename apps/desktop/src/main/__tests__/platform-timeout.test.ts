import { describe, expect, it } from "bun:test";
import { createPlatformClient } from "../platform-client";

/**
 * A silent platform does not hold the app.
 *
 * It accepts the connection and never answers: the case nobody sees — no
 * refusal, no cut, the screen sits on its step. A call has to come back
 * refused, and say so.
 */
function neverAnswers(): { fetch: typeof fetch; calls: () => number } {
  let calls = 0;

  return {
    calls: () => calls,
    fetch: ((_input: unknown, init?: RequestInit) => {
      calls += 1;

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("délai dépassé"))
        );
      });
    }) as unknown as typeof fetch,
  };
}

describe("un appel à la plateforme", () => {
  it("renonce plutôt que de pendre, et rend un refus lisible", async () => {
    const silent = neverAnswers();
    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: silent.fetch,
      timeoutMs: 80,
    });

    const started = Date.now();
    const answer = await platform.enroll("jeton", {
      device_id: "dev-1",
      host: "192.168.100.228",
      port: 2222,
      probe: { arch: "amd64" },
      ssh_user: "root",
    });

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "offline", phrase: { id: "refusal.platform.silent" } },
    });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(silent.calls()).toBe(1);
  });

  /** The binary weighs eighteen megabytes: it isn't judged by a call's timeout. */
  it("laisse au binaire le temps d'un téléchargement, pas celui d'un appel", async () => {
    let storageDeadline = 0;

    const redirecting = ((input: unknown, init?: RequestInit) => {
      if (String(input).includes("/releases/agent/")) {
        return Promise.resolve(
          new Response(null, {
            headers: {
              location: "https://storage.example/pupitred",
              "x-pupitre-release-storage": "r2",
            },
            status: 303,
          })
        );
      }

      storageDeadline = Date.now();

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          storageDeadline = Date.now() - storageDeadline;
          reject(new Error("délai dépassé"));
        });
      });
    }) as unknown as typeof fetch;

    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: redirecting,
      timeoutMs: 40,
      downloadMs: 400,
    });

    const answer = await platform.downloadRelease("jeton", "1.2.3", "amd64");

    expect(answer.ok).toBe(false);
    expect(storageDeadline).toBeGreaterThan(200);
  });

  /**
   * The storage answers with S3's XML, never with the console's envelope: a
   * refusal there is the storage's, and it is named — not laid on the console
   * with an invitation to sign in again.
   */
  it("nomme le stockage qui refuse le binaire, avec sa raison", async () => {
    const refusing = ((input: unknown) => {
      if (String(input).includes("/releases/agent/")) {
        return Promise.resolve(
          new Response(null, {
            headers: {
              location: "https://storage.example/pupitred",
              "x-pupitre-release-storage": "r2",
            },
            status: 303,
          })
        );
      }

      return Promise.resolve(
        new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>InvalidArgument</Code><Message>Credential access key has length 35, should be 32</Message></Error>',
          { status: 400, headers: { "content-type": "application/xml" } }
        )
      );
    }) as unknown as typeof fetch;

    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: refusing,
    });

    const answer = await platform.downloadRelease("jeton", "1.2.3", "amd64");

    expect(answer).toEqual({
      ok: false,
      error: {
        code: "release_not_found",
        message: "refusal.release.storage",
        phrase: {
          id: "refusal.release.storage",
          values: {
            detail:
              "InvalidArgument: Credential access key has length 35, should be 32",
            status: 400,
            version: "1.2.3",
          },
        },
      },
    });
  });
});
