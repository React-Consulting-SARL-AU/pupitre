import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { Service } from "@pupitre/shared/agent-protocol/state";
import type { PortForward } from "@shared/services";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG, DB_MONGODB } from "../../__tests__/catalog-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { removalOf } from "../../lib/service-removal";
import { useCatalog } from "../../stores/catalog";
import { CatalogChoice } from "../catalog/catalog-choice";
import { ConfigForm } from "../config/config-form";
import { ServiceCredentials } from "../services/service-credentials";
import { ServiceForward } from "../services/service-forward";
import { ServiceRemovalLosses } from "../services/service-removal-losses";
import { ServiceRow } from "../services/service-row";
import { ServicesTunnel } from "../services/services-tunnel";

const SERVER = "srv-1";

/** What a server that has been through the onboarding already runs. */
const INSTALLED = ["core.system", "core.hardening", "runtime.node", "db.mysql"];

const WITH_MONGO = {
  modules: [...CATALOG.modules, DB_MONGODB],
  presets: CATALOG.presets,
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/** The opening tag that carries this attribute, whatever order it renders in. */
function tag(html: string, attribute: string, value: string): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<[a-z]+[^>]*${attribute}="${escaped}"[^>]*>`)
  );

  return match?.[0] ?? "";
}

function source(file: string): string {
  return readFileSync(join(import.meta.dir, "..", "services", file), "utf8");
}

async function catalogReady(): Promise<void> {
  stubPupitre({
    catalog: () => Promise.resolve({ ok: true, result: WITH_MONGO }),
    generateInstallSecret: () =>
      Promise.resolve({
        ok: true as const,
        result: {
          "db.mongodb": {
            app_password: { filled: true, generated: true, revealed: false },
          },
        },
      }),
  });

  await useCatalog.getState().load(SERVER, INSTALLED);
  await useCatalog.getState().settled();
}

const POSTGRES: Service = {
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  state: "running",
  unit: "postgresql.service",
  version: "17.2",
};

describe("la ligne d'un service", () => {
  const html = renderToStaticMarkup(
    <ServiceRow onOpen={() => undefined} service={POSTGRES} />
  );

  it("dit l'état, la version, le port et l'unité", () => {
    expect(text(html)).toContain("PostgreSQL 17");
    expect(text(html)).toContain(
      "db.postgres · 17.2 · port 5432 · postgresql.service"
    );
  });

  it("porte l'état par sa forme avant sa couleur", () => {
    expect(tag(html, "data-state", "running")).toContain("data-state");
    expect(html).toContain('data-shape="filled"');
  });
});

describe("les identifiants d'un service", () => {
  const html = renderToStaticMarkup(
    <ServiceCredentials
      database
      labels={["Rôle applicatif", "URL de connexion"]}
      onConnectionUrl={() => undefined}
      onCopy={() => Promise.resolve(true)}
      onReveal={() => Promise.resolve("jamais-affiché")}
    />
  );

  it("les nomme sans en montrer un seul", () => {
    expect(text(html)).toContain("Rôle applicatif");
    expect(html).toContain('data-revealed="false"');
    expect(html).toContain("••••");
    expect(html).not.toContain("jamais-affiché");
  });

  it("offre à chacun d'être montré et copié", () => {
    expect(text(html)).toContain("Montrer");
    expect(text(html)).toContain("Copier");
  });

  it("propose l'URL de connexion à une base, et à elle seule", () => {
    const plain = renderToStaticMarkup(
      <ServiceCredentials
        database={false}
        labels={["Jeton d'accès"]}
        onCopy={() => Promise.resolve(true)}
        onReveal={() => Promise.resolve(null)}
      />
    );

    expect(text(html)).toContain("Demander l'URL de connexion");
    expect(text(plain)).not.toContain("Demander l'URL de connexion");
  });
});

describe("la confirmation d'un retrait", () => {
  const removal = removalOf(
    { id: DB_MONGODB.id, manifest: DB_MONGODB, name: DB_MONGODB.name },
    [...CATALOG.modules, DB_MONGODB]
  );

  const html = renderToStaticMarkup(
    <ServiceRemovalLosses
      losses={removal.losses}
      name={DB_MONGODB.name}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  );

  it("nomme les données perdues avant de proposer le geste", () => {
    expect(text(html)).toContain(
      "Les bases de données de ce moteur, leurs comptes et leurs mots de passe."
    );
    expect(text(html)).toContain("secrets envoyés à l'installation");
    expect(html).toContain('data-confirm="uninstall"');
  });

  it("ne laisse pas croire qu'une sauvegarde est prise au passage", () => {
    expect(text(html)).toContain("Rien n'est sauvegardé au passage");
  });
});

describe("le tunnel du serveur", () => {
  const tunnel: TunnelStatusResult = {
    installed: true,
    routes: [
      {
        hostname: "flymate.example.org",
        project: "flymate-api",
        service: "http://127.0.0.1:3000",
      },
    ],
    state: "running",
  };

  it("montre les routes que l'agent déclare", () => {
    const html = renderToStaticMarkup(
      <ServicesTunnel
        busy={null}
        onRestart={() => undefined}
        onSync={() => undefined}
        tunnel={tunnel}
      />
    );

    expect(html).toContain('data-route="flymate.example.org"');
    expect(text(html)).toContain("http://127.0.0.1:3000");
  });

  it("dit ce qui tient lieu de tunnel quand il n'y en a pas", () => {
    const html = renderToStaticMarkup(
      <ServicesTunnel
        busy={null}
        onRestart={() => undefined}
        onSync={() => undefined}
        tunnel={{ installed: false, routes: [], state: "absent" }}
      />
    );

    expect(text(html)).toContain("session SSH de l'app");
  });
});

describe("le tunnel vers un port", () => {
  const forward: PortForward = {
    id: "f1",
    label: "db.postgres",
    localPort: 55_001,
    remotePort: 5432,
    serverId: SERVER,
  };

  it("donne l'adresse locale à coller dans un client", () => {
    const html = renderToStaticMarkup(
      <ServiceForward
        forwards={[forward]}
        onClose={() => undefined}
        onOpen={() => undefined}
        port={5432}
      />
    );

    expect(text(html)).toContain("127.0.0.1:55001");
    expect(html).toContain('data-forward="f1"');
  });

  it("ne propose rien pour un service qui n'écoute nulle part", () => {
    const html = renderToStaticMarkup(
      <ServiceForward
        forwards={[]}
        onClose={() => undefined}
        onOpen={() => undefined}
      />
    );

    expect(html).toBe("");
  });
});

describe("ajouter un module à un serveur déjà installé", () => {
  it("passe par le catalogue de l'onboarding, sans reproposer l'existant", async () => {
    await catalogReady();

    const html = renderToStaticMarkup(
      <CatalogChoice
        blocked={useCatalog.getState().unreachable()}
        catalog={WITH_MONGO}
        selected={useCatalog.getState().selected}
        warnings={[]}
      />
    );

    expect(tag(html, "data-module", "db.mongodb")).toContain(
      'data-blocked="false"'
    );
    expect(tag(html, "data-module", "runtime.node")).toContain(
      'data-blocked="true"'
    );
    expect(text(html)).toContain("Déjà installé sur ce serveur.");
  });

  it("n'entraîne dans l'installation que le module ajouté", async () => {
    await catalogReady();
    useCatalog.getState().toggle("db.mongodb");
    await useCatalog.getState().settled();

    expect(useCatalog.getState().selected).toEqual(["db.mongodb"]);
    expect(Object.keys(useCatalog.getState().config())).toEqual(["db.mongodb"]);
  });

  it("pose les questions du manifeste, et seulement les siennes", async () => {
    await catalogReady();
    useCatalog.getState().toggle("db.mongodb");
    await useCatalog.getState().settled();

    const state = useCatalog.getState();
    const html = renderToStaticMarkup(
      <ConfigForm
        groups={state.groups()}
        machineName="atelier"
        secrets={state.secrets}
        values={state.values}
      />
    );

    expect(text(html)).toContain("MongoDB 8");
    expect(text(html)).toContain("Mot de passe applicatif");
    expect(text(html)).not.toContain("Nom git");
  });

  /**
   * The criterion is that the screens are the onboarding's own. A rendering
   * cannot say where a component came from; the import can — and no screen of
   * its own sits next to it.
   */
  it("monte les écrans de l'onboarding plutôt que des siens", () => {
    const flow = source("services-add-flow.tsx");

    expect(flow).toContain(
      'from "@renderer/components/catalog/catalog-screen"'
    );
    expect(flow).toContain('from "@renderer/components/config/config-screen"');
    expect(flow).toContain(
      'from "@renderer/components/install/install-screen"'
    );
    expect(readdirSync(join(import.meta.dir, "..", "services"))).not.toContain(
      "services-config-screen.tsx"
    );
  });
});
