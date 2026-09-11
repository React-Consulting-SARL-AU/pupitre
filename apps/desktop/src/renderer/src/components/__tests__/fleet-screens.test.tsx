import { describe, expect, it } from "bun:test";
import type { AccountIdentity } from "@shared/account";
import type { ServerGrant } from "@shared/servers";
import { renderToStaticMarkup } from "react-dom/server";
import type { FleetOpening, GrantedServer } from "../../stores/fleet";
import { FleetOrganizations } from "../fleet/fleet-organizations";
import { FleetServerRow } from "../fleet/fleet-server-row";

/**
 * What an invited member reads about a server they never typed an address for.
 *
 * The three states of an assignment are told apart by their shape, and the
 * remedy of a refusal is printed exactly as the main process phrased it.
 */

const NOOP = () => undefined;

const GRANT: ServerGrant = {
  adopted: true,
  id: "srv-platform-1",
  keyReady: true,
  listed: true,
  opened: false,
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

function server(grant: Partial<ServerGrant> = {}): GrantedServer {
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
    <FleetServerRow onOpen={NOOP} opening={opening} server={server(grant)} />
  );
}

describe("un serveur attribué", () => {
  it("montre l'adresse que la console a donnée, sans champ à remplir", () => {
    const html = row();

    expect(text(html)).toContain("dev@203.0.113.10:22");
    expect(html).not.toContain("<input");
  });

  it("distingue les trois états d'une attribution par leur forme", () => {
    const shapes = [
      row(),
      row({ keyReady: false }),
      row({ status: "suspended" }),
    ].map((html) => /data-shape="([a-z]+)"/.exec(html)?.[1]);

    expect(shapes).toEqual(["filled", "breathing", "struck"]);
    expect(new Set(shapes).size).toBe(3);
  });

  it("n'offre pas d'ouvrir un serveur suspendu, et dit pourquoi", () => {
    const html = row({ status: "suspended" });

    expect(text(html)).toContain("La console a suspendu ce serveur");
    expect(html).not.toContain("<button");
  });

  it("dit ce qui se passe pendant l'attente de la clé", () => {
    const html = row(
      { keyReady: false },
      { serverId: "srv-platform-1", status: "waiting" }
    );

    expect(text(html)).toContain("La console pose votre clé");
    expect(html).toContain('aria-busy="true"');
  });

  it("affiche le remède d'un refus tel quel", () => {
    const html = row(
      {},
      {
        error: {
          code: "entitlement_required",
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

  it("propose de le reprendre plutôt que de l'ouvrir une seconde fois", () => {
    expect(text(row({ opened: true }))).toContain("Le piloter");
    expect(text(row())).toContain("Ouvrir");
  });
});

describe("les organisations", () => {
  const identity: AccountIdentity = {
    email: "ada@pupitre.studio",
    entitlement: "valid",
    name: "Ada",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "member", slug: "ada" },
      { id: "org-2", name: "Fonderie", role: "owner", slug: "fonderie" },
    ],
    role: "member",
    subscription: null,
  };

  it("marque l'organisation active par une forme pleine", () => {
    const html = renderToStaticMarkup(
      <FleetOrganizations identity={identity} />
    );

    expect(html.match(/data-shape="filled"/g)).toHaveLength(1);
    expect(text(html)).toContain("Atelier Ada");
    expect(text(html)).toContain("Fonderie");
    expect(text(html)).toContain("Membre");
    expect(text(html)).toContain("Propriétaire");
  });

  it("n'offre la bascule qu'aux organisations qui ne sont pas actives", () => {
    const html = renderToStaticMarkup(
      <FleetOrganizations identity={identity} />
    );

    expect(html.match(/Rendre active|Make active/g)).toHaveLength(1);
  });

  it("ne montre rien quand il n'y a rien à choisir", () => {
    for (const organizations of [[], identity.organizations.slice(0, 1)]) {
      expect(
        renderToStaticMarkup(
          <FleetOrganizations identity={{ ...identity, organizations }} />
        )
      ).toBe("");
    }
  });
});
