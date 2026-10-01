import { describe, expect, it } from "bun:test";
import type { AccountIdentity } from "@shared/account";
import type { Server, ServerGrant } from "@shared/servers";
import { renderToStaticMarkup } from "react-dom/server";
import type { FleetOpening } from "../../stores/fleet";
import { FleetOrganizations } from "../fleet/fleet-organizations";
import { ServerGrantDetail } from "../servers/server-grant-detail";
import { ServerGrantOpen } from "../servers/server-grant-open";
import { ServerRow } from "../servers/server-row";

const NOOP = () => undefined;

const GRANT: ServerGrant = {
  adopted: true,
  id: "srv-platform-1",
  keyReady: true,
  listed: true,
  opened: false,
  organization: { id: "org-1", name: "Atelier Ada" },
  status: "active",
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function server(grant: Partial<ServerGrant> = {}): Server {
  return {
    grant: { ...GRANT, ...grant },
    host: "203.0.113.10",
    hostFingerprint: "SHA256:atelier",
    id: "srv-platform-1",
    keyPath: "/data/keys/device",
    name: "vps-atelier",
    origin: "app",
    port: 22,
    user: "dev",
  };
}

function row(
  grant: Partial<ServerGrant> = {},
  opening: FleetOpening | null = null
): string {
  return renderToStaticMarkup(
    <ServerRow
      active={false}
      onActivate={NOOP}
      onForget={NOOP}
      onOpen={NOOP}
      onRemove={NOOP}
      onRename={NOOP}
      opening={opening}
      server={server(grant)}
    />
  );
}

function detail(grant: Partial<ServerGrant> = {}): string {
  return renderToStaticMarkup(
    <ServerGrantDetail grant={{ ...GRANT, ...grant }} />
  );
}

function opener(
  grant: Partial<ServerGrant> = {},
  opening: FleetOpening | null = null
): string {
  return renderToStaticMarkup(
    <ServerGrantOpen
      grant={{ ...GRANT, ...grant }}
      onOpen={NOOP}
      opening={opening}
    />
  );
}

describe("an assigned server", () => {
  it("is a row of the list, with the console's alias among its facts", () => {
    const html = text(row());

    expect(html).toContain("dev@203.0.113.10:22");
    expect(html).toContain("attribuée par votre organisation");
    expect(html).toContain("Console");
    expect(html).toContain("Attribué · actif");
    expect(html).toContain("Atelier Ada");
    expect(html).toContain("Ouvrir");
  });

  it("says nothing of the console for a server it no longer names", () => {
    const html = text(row({ listed: false }));

    expect(html).not.toContain("Console");
    expect(html).not.toContain("Ouvrir");
  });

  it("tells the three states of an assignment apart by shape", () => {
    const shapes = [
      detail(),
      detail({ keyReady: false }),
      detail({ status: "suspended" }),
    ].map((html) => /data-shape="([a-z]+)"/.exec(html)?.[1]);

    expect(shapes).toEqual(["filled", "breathing", "struck"]);
    expect(new Set(shapes).size).toBe(3);
  });

  it("does not offer to open a suspended server, and says why", () => {
    const html = opener({ status: "suspended" });

    expect(text(html)).toContain("La console a suspendu ce serveur");
    expect(html).not.toContain("<button");
  });

  it("says what is happening while waiting for the key", () => {
    const html = opener(
      { keyReady: false },
      { serverId: "srv-platform-1", status: "waiting" }
    );

    expect(text(html)).toContain("La console pose votre clé");
    expect(html).toContain('aria-busy="true"');
  });

  it("shows the fix of a refusal as it comes", () => {
    const html = opener(
      {},
      {
        error: {
          code: "license_required",
          fix: "Demande une nouvelle attribution.",
          message: "Ce serveur ne t'est plus attribué.",
        },
        serverId: "srv-platform-1",
        status: "refused",
      }
    );

    expect(text(html)).toContain("Ce serveur ne t'est plus attribué.");
    expect(text(html)).toContain("Demande une nouvelle attribution.");
  });

  it("offers the opening only once: after that the row is driven like the others", () => {
    expect(text(opener())).toContain("Ouvrir");
    expect(opener({ opened: true })).toBe("");
    expect(text(row({ opened: true }))).not.toContain("Ouvrir");
  });
});

describe("the organizations", () => {
  const identity: AccountIdentity = {
    email: "ada@pupitre.studio",
    license: "valid",
    licenseGrant: null,
    name: "Ada",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "member", slug: "ada" },
      { id: "org-2", name: "Fonderie", role: "owner", slug: "fonderie" },
    ],
    role: "member",
    servers: { limit: 3, used: 1 },
  };

  it("marks the active organization with a filled shape", () => {
    const html = renderToStaticMarkup(
      <FleetOrganizations identity={identity} />
    );

    expect(html.match(/data-shape="filled"/g)).toHaveLength(1);
    expect(text(html)).toContain("Atelier Ada");
    expect(text(html)).toContain("Fonderie");
    expect(text(html)).toContain("Membre");
    expect(text(html)).toContain("Propriétaire");
  });

  it("offers the switch only to organizations that are not active", () => {
    const html = renderToStaticMarkup(
      <FleetOrganizations identity={identity} />
    );

    expect(html.match(/Rendre active|Make active/g)).toHaveLength(1);
  });

  it("shows nothing when there is nothing to choose", () => {
    for (const organizations of [[], identity.organizations.slice(0, 1)]) {
      expect(
        renderToStaticMarkup(
          <FleetOrganizations identity={{ ...identity, organizations }} />
        )
      ).toBe("");
    }
  });
});
