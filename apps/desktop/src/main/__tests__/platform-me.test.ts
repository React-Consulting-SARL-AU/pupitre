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
  license: "valid",
  license_grant: null,
  organizations: [
    {
      id: "org-1",
      name: "Atelier Ada",
      role: "owner",
      slug: "ada",
      state: "active",
    },
  ],
  platform_can_act: false,
  platform_role: null,
  role: "owner",
  servers: { limit: 3, used: 1 },
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

const GRANT = {
  current_period_end: "2027-09-25T00:00:00.000Z",
  seats: 5,
  status: "active",
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
  it("porte la licence et les serveurs tels que /me les rend", async () => {
    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: answering({
        ...ME,
        license_grant: GRANT,
        servers: { limit: 8, used: 6 },
      }),
    });

    const identity = await platform.me("jeton");

    expect(identity).toMatchObject({
      ok: true,
      result: {
        email: "ada@pupitre.studio",
        license: "valid",
        licenseGrant: GRANT,
        servers: { limit: 8, used: 6 },
      },
    });
  });

  it("garde de l'organisation active ce que le compte retient, sans son état ni les champs hérités", async () => {
    const platform = createPlatformClient({
      baseUrl: "https://app.pupitre.studio",
      fetch: answering(ME),
    });

    const identity = await platform.me("jeton");

    expect(identity).toEqual({
      ok: true,
      result: {
        email: "ada@pupitre.studio",
        license: "valid",
        licenseGrant: null,
        name: "Ada Lovelace",
        organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
        organizations: [
          { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
        ],
        role: "owner",
        servers: { limit: 3, used: 1 },
      },
    });
  });

  it("refuse un /me qu'elle ne sait pas lire plutôt que d'inventer une identité", async () => {
    const { license: _license, ...withoutLicense } = ME;

    for (const body of [
      withoutLicense,
      { ...ME, license: "unknown" },
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
