import { describe, expect, it } from "bun:test";
import { createPlatformClient } from "../platform-client";

/**
 * What `/me` says of the subscription reaches the identity as it came, and a
 * platform that does not say it yet leaves the identity without one rather
 * than refusing the whole account.
 */

const ME = {
  active_organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
  entitlement: "valid",
  organizations: [
    { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
  ],
  role: "owner",
  user: { email: "ada@pupitre.studio", name: "Ada Lovelace" },
};

const SUBSCRIPTION = {
  current_period_end: "2026-09-25T00:00:00.000Z",
  servers: { limit: 2, used: 1 },
  status: "trialing",
  trial_ends_at: "2026-09-25T00:00:00.000Z",
};

function answering(body: unknown): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
    )) as unknown as typeof fetch;
}

describe("l'identité lue sur la plateforme", () => {
  it("porte l'abonnement tel que /me le rend", async () => {
    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: answering({ ...ME, subscription: SUBSCRIPTION }),
    });

    const identity = await platform.me("jeton");

    expect(identity).toMatchObject({
      ok: true,
      result: {
        email: "ada@pupitre.studio",
        entitlement: "valid",
        subscription: SUBSCRIPTION,
      },
    });
  });

  it("reste lisible quand la plateforme ne dit rien de l'abonnement", async () => {
    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: answering(ME),
    });

    const identity = await platform.me("jeton");

    expect(identity).toMatchObject({
      ok: true,
      result: { subscription: null },
    });
  });
});
