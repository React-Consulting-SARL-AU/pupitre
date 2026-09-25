import { describe, expect, it } from "bun:test";
import { createPlatformClient } from "../platform-client";

const ME = {
  active_organization: {
    id: "org-1",
    name: "Atelier Ada",
    reason: null,
    slug: "ada",
    state: "active",
  },
  entitlement: "valid",
  organizations: [
    {
      id: "org-1",
      name: "Atelier Ada",
      role: "owner",
      slug: "ada",
      state: "active",
    },
  ],
  platform_role: null,
  role: "owner",
  subscription: null,
  user: {
    created_at: "2026-09-01T10:00:00.000Z",
    email: "ada@pupitre.studio",
    id: "usr-1",
    image: null,
    locale: "fr",
    name: "Ada Lovelace",
  },
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

  it("garde de l'organisation active ce que le compte retient, sans son état", async () => {
    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: answering(ME),
    });

    const identity = await platform.me("jeton");

    expect(identity).toEqual({
      ok: true,
      result: {
        email: "ada@pupitre.studio",
        entitlement: "valid",
        name: "Ada Lovelace",
        organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
        organizations: [
          { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
        ],
        role: "owner",
        subscription: null,
      },
    });
  });

  it("refuse un /me qu'elle ne sait pas lire plutôt que d'inventer une identité", async () => {
    const { subscription: _subscription, ...withoutSubscription } = ME;

    for (const body of [
      withoutSubscription,
      { ...ME, entitlement: "unknown" },
      { ...ME, role: "superuser" },
    ]) {
      const platform = createPlatformClient({
        baseUrl: "https://app.pupitre.studio",
        fetch: answering(body),
      });

      expect(await platform.me("jeton")).toEqual({
        error: {
          code: "internal",
          message: "refusal.platform.unreadable",
          phrase: {
            id: "refusal.platform.unreadable",
            values: { path: "/me" },
          },
        },
        ok: false,
      });
    }
  });
});
