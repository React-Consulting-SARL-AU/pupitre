import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { Service } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import type { PortForward } from "@shared/services";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CATALOG,
  DB_MONGODB,
  EXPOSURE_CLOUDFLARE,
} from "../../__tests__/catalog-fixtures";
import { mount } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { LOGIN_LOOK } from "../../lib/project-state";
import { removalOf } from "../../lib/service-removal";
import { useCatalog } from "../../stores/catalog";
import { CatalogChoice } from "../catalog/catalog-choice";
import { ConfigModuleGroup } from "../config/config-module-group";
import { ConnectionConnected } from "../connections/connection-connected";
import {
  type ConnectionDescriptor,
  descriptorOf,
} from "../connections/connection-descriptors";
import { ServiceAccount } from "../services/service-account";
import { ServiceConfig } from "../services/service-config";
import { ServiceCredentials } from "../services/service-credentials";
import { ServiceForward } from "../services/service-forward";
import { ServicePanelFacts } from "../services/service-panel-facts";
import { ServiceRemovalLosses } from "../services/service-removal-losses";
import { ServiceRoutes } from "../services/service-routes";
import { ServiceRow } from "../services/service-row";
import { ServicesList } from "../services/services-list";
import { ServicesTunnel } from "../services/services-tunnel";
import { ScreenFailure } from "../shell/screen-failure";
import { StatePill } from "../ui/state-pill";

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
  configured: true,
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  runs: true,
  state: "running",
  unit: "postgresql.service",
  version: "17.2",
};

describe("la ligne d'un service", () => {
  const html = renderToStaticMarkup(
    <ServiceRow onOpen={() => undefined} service={POSTGRES} />
  );

  it("dit l'état, la version et le port", () => {
    expect(text(html)).toContain("PostgreSQL 17");
    expect(text(html)).toContain("17.2 · port 5432");
  });

  it("porte l'état par sa forme avant sa couleur", () => {
    expect(tag(html, "data-state", "running")).toContain("data-state");
    expect(html).toContain('data-shape="filled"');
    expect(html).not.toContain('data-state="signed_');
  });

  it("dit si le service est connecté quand il travaille pour un compte", () => {
    const signedOut = renderToStaticMarkup(
      <ServiceRow
        account="signed_out"
        onOpen={() => undefined}
        service={{ ...POSTGRES, id: "ai.claude", name: "Claude Code" }}
      />
    );

    expect(signedOut).toContain('data-state="running"');
    expect(signedOut).toContain('data-state="signed_out"');
    expect(text(signedOut)).toContain("non connecté");
  });
});

describe("la liste des services", () => {
  const html = renderToStaticMarkup(
    <ServicesList
      accounts={{ "ai.claude": "signed_in" }}
      onOpen={() => undefined}
      services={[
        { ...POSTGRES, id: "ai.claude", name: "Claude Code" },
        POSTGRES,
        { ...POSTGRES, id: "runtime.node", name: "Node.js" },
        { ...POSTGRES, id: "core.system", name: "Système" },
        { ...POSTGRES, id: "db.mysql", name: "MySQL" },
      ]}
    />
  );

  it("range chaque service sous la catégorie du catalogue, dans l'ordre du catalogue", () => {
    const categories = [
      ...html.matchAll(/data-service-category="([a-z]+)"/g),
    ].map((match) => match[1]);

    expect(categories).toEqual(["core", "runtime", "database", "ai"]);
    expect(text(html)).toMatch(/Base.*Runtimes.*Bases de données.*Agents IA/);
  });

  it("garde dans une catégorie l'ordre du snapshot", () => {
    const databases = html.slice(
      html.indexOf('data-service-category="database"'),
      html.indexOf('data-service-category="ai"')
    );

    expect(databases.indexOf('data-service="db.postgres"')).toBeLessThan(
      databases.indexOf('data-service="db.mysql"')
    );
    expect(databases).not.toContain('data-service="runtime.node"');
  });

  it("dit sur la ligne le compte que le service tient", () => {
    expect(html).toContain('data-state="signed_in"');
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

  /** A runtime has nothing to open it; a section saying so was noise on every such page. */
  it("n'existe pas pour un module sans identifiant", () => {
    const none = renderToStaticMarkup(
      <ServiceCredentials
        database={false}
        labels={[]}
        onCopy={() => Promise.resolve(true)}
        onReveal={() => Promise.resolve(null)}
      />
    );

    expect(none).toBe("");
  });
});

describe("le compte d'un service", () => {
  const WRANGLER: Manifest = {
    ...EXPOSURE_CLOUDFLARE,
    connection: "wrangler",
    fields: [],
    id: "tool.wrangler",
    name: "Wrangler",
  };

  const github = descriptorOf("github") as ConnectionDescriptor;

  it("dit l'état que l'agent a répondu, et le compte qu'il a nommé", () => {
    const html = renderToStaticMarkup(
      <ServiceAccount
        installed={[]}
        login={{ account: "jordan@example.org", state: "signed_in" }}
        manifest={null}
        serverName={null}
      />
    );

    expect(tag(html, "data-service-account", "signed_in")).not.toBe("");
    expect(text(html)).toContain("Compte");
    expect(text(html)).toContain("connecté");
    expect(text(html)).toContain("jordan@example.org");
    expect(html).not.toContain("data-connection=");
  });

  it("dit comment se connecter quand le CLI ne tient rien", () => {
    const html = renderToStaticMarkup(
      <ServiceAccount
        installed={[]}
        login={{ fix: "Reconnectez le compte.", state: "signed_out" }}
        manifest={null}
        serverName={null}
      />
    );

    expect(tag(html, "data-service-account", "signed_out")).not.toBe("");
    expect(text(html)).toContain("non connecté");
    expect(text(html)).toContain("Reconnectez le compte.");
  });

  /** The state the section says stands where the card's own sentence was: one state, the gestures beside it. */
  it("met les gestes du compte sur la ligne de l'état, sans redire qu'il est connecté", () => {
    const html = renderToStaticMarkup(
      <ConnectionConnected
        busy={false}
        connection={github}
        health={undefined}
        onForget={() => Promise.resolve()}
        onVerify={() => Promise.resolve()}
        scope={{ known: true, modules: ["tool.github"] }}
        serverName="atelier"
        state={{
          account: { id: "42", name: "ada" },
          sealed: true,
          status: "connected",
        }}
        status={<StatePill look={LOGIN_LOOK.signed_in} name="signed_in" />}
      />
    );

    expect(tag(html, "data-state", "signed_in")).not.toBe("");
    expect(text(html)).toContain("Vérifier");
    expect(text(html)).toContain("Déconnecter");
    expect(text(html)).not.toContain("Connecté en tant que");
  });

  /** A tunnel has no CLI to ask; the account it was made from is still an account. */
  it("existe pour un module qui n'a qu'une connexion, et demande le jeton qui manque", () => {
    stubPupitre({});

    const html = renderToStaticMarkup(
      <ServiceAccount
        installed={[WRANGLER]}
        manifest={WRANGLER}
        serverName="atelier"
      />
    );

    expect(tag(html, "data-service-account", "signed_out")).not.toBe("");
    expect(text(html)).toContain("non connecté");
    expect(html).toContain('data-connection="wrangler"');
    expect(html).toContain('type="password"');
  });

  it("n'existe pas pour un module sans compte", () => {
    const html = renderToStaticMarkup(
      <ServiceAccount installed={[]} manifest={null} serverName={null} />
    );

    expect(html).toBe("");
  });
});

describe("la confirmation d'un retrait", () => {
  const removal = removalOf(
    { id: DB_MONGODB.id, manifest: DB_MONGODB, name: DB_MONGODB.name },
    [...CATALOG.modules, DB_MONGODB]
  );

  const asked = () =>
    mount(
      <ServiceRemovalLosses
        losses={removal.losses}
        name={DB_MONGODB.name}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open
      />
    );

  it("nomme les données perdues avant de proposer le geste", async () => {
    const view = await asked();
    const html = view.html();

    expect(text(html)).toContain(
      "Les bases de données de ce moteur, leurs comptes et leurs mots de passe."
    );
    expect(text(html)).toContain("secrets envoyés à l'installation");
    expect(html).toContain('data-confirm="uninstall"');
    expect(html.indexOf("Retirer définitivement")).toBeGreaterThan(
      html.indexOf("secrets envoyés")
    );

    view.unmount();
  });

  /** The gesture stands in the header; the question floats over the page it was asked from. */
  it("pose la question dans une boîte de dialogue, et rien tant qu'elle n'est pas ouverte", async () => {
    const view = await asked();
    const html = view.html();

    expect(html).toContain('data-dialog="uninstall"');
    expect(html).toContain('role="dialog"');

    view.unmount();

    const closed = renderToStaticMarkup(
      <ServiceRemovalLosses
        losses={removal.losses}
        name={DB_MONGODB.name}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open={false}
      />
    );

    expect(closed).toBe("");
  });

  it("ne laisse pas croire qu'une sauvegarde est prise au passage", async () => {
    const view = await asked();

    expect(view.text()).toContain("Rien n'est sauvegardé au passage");

    view.unmount();
  });
});

describe("les routes du module d'exposition", () => {
  const tunnel: TunnelStatusResult = {
    provider: "cloudflare",
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

  it("montre les routes que l'agent déclare, et le geste qui les réécrit", () => {
    const html = renderToStaticMarkup(
      <ServiceRoutes
        busy={null}
        onSync={() => undefined}
        problem={null}
        tunnel={tunnel}
      />
    );

    expect(html).toContain('data-route="flymate.example.org"');
    expect(text(html)).toContain("http://127.0.0.1:3000");
    expect(text(html)).toContain("Synchroniser les routes");
    expect(text(html)).not.toContain("Redémarrer");
  });

  it("dit ce qui tient lieu de tunnel quand le serveur n'en a pas", () => {
    const html = renderToStaticMarkup(<ServicesTunnel />);

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
    const html = state
      .groups()
      .map((group) =>
        renderToStaticMarkup(
          <ConfigModuleGroup
            group={group}
            handlers={{}}
            key={group.module.id}
            marks={state.secrets[group.module.id]}
            problems={[]}
            values={state.values[group.module.id] ?? {}}
          />
        )
      )
      .join("");

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

const DETAIL = {
  configured: true,
  credentials: [],
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  state: "running" as const,
  unit: "postgresql",
  version: "17.2",
};

describe("l'en-tête d'un service", () => {
  const html = renderToStaticMarkup(<ServicePanelFacts detail={DETAIL} />);

  it("montre ce qui décide : la version et le port", () => {
    expect(text(html)).toContain("17.2");
    expect(text(html)).toContain("port 5432");
  });

  /** What names the module on the machine decides nothing for the reader, and everything for whoever goes looking on the server. */
  it("range l'identifiant et l'unité systemd sous Détails", () => {
    const fold = html.indexOf('hidden=""');
    const details = html.slice(fold);

    expect(fold).toBeGreaterThan(-1);
    expect(details).toContain("db.postgres");
    expect(details).toContain("postgresql");
    expect(html.slice(0, fold)).not.toContain("db.postgres");
  });

  /** A mandatory module has no removal button; the header says why in its place. */
  it("dit dans l'en-tête pourquoi un module obligatoire ne se retire pas", () => {
    const held = renderToStaticMarkup(
      <ServicePanelFacts
        detail={DETAIL}
        refusal="Le catalogue de ce serveur déclare ce module obligatoire."
      />
    );

    expect(tag(held, "data-removal-refused", "")).not.toBe("");
    expect(text(held)).toContain("déclare ce module obligatoire");
    expect(html).not.toContain("data-removal-refused");
  });

  it("ne laisse pas une ligne vide pour un service sans version ni port", () => {
    const bare = renderToStaticMarkup(
      <ServicePanelFacts
        detail={{ ...DETAIL, port: undefined, version: undefined }}
      />
    );

    expect(bare).not.toContain("data-service-facts");
  });
});

describe("les réglages d'un service dont le catalogue manque", () => {
  const props = {
    apply: { status: "idle" } as const,
    config: { status: "idle" } as const,
    name: "PostgreSQL 17",
    onApply: () => undefined,
    onGenerate: () => undefined,
    onReveal: () => Promise.resolve(null),
    onSecret: () => undefined,
    onValue: () => undefined,
    secrets: {},
    steps: [],
    values: {},
  };

  /** A section that simply vanished left the reader looking for what a service can be told. */
  it("dit pourquoi ils manquent, et propose de relire le catalogue", () => {
    const html = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        manifest={null}
        onReloadCatalog={() => undefined}
      />
    );

    expect(html).toContain('data-config="unknown"');
    expect(text(html)).toContain("catalogue du serveur n'a pas répondu");
    expect(text(html)).toContain("Relire le catalogue");
  });

  // The domain of an installed tunnel is picked among the account's zones and
  // stays typed below, a subdomain of the zone being allowed; without an
  // account to ask, the field alone remains.
  it("propose les zones du compte pour le domaine d'un tunnel installé", () => {
    const config = {
      answered: { domain: "flymate.dev" },
      baseline: { domain: "flymate.dev" },
      held: [],
      moduleId: EXPOSURE_CLOUDFLARE.id,
      status: "ready" as const,
    };

    const picked = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        config={config}
        manifest={EXPOSURE_CLOUDFLARE}
        values={{ domain: "flymate.dev" }}
        zones={[
          { id: "z-1", name: "flymate.dev" },
          { id: "z-2", name: "flymate.studio" },
        ]}
      />
    );

    expect(picked).toContain('id="exposure.cloudflare.zone"');
    expect(picked).toContain('role="combobox"');
    expect(picked).toMatch(
      /id="exposure.cloudflare.zone"[^>]*>[^<]*<span[^>]*>flymate\.dev</
    );
    expect(picked).toContain('data-field="exposure.cloudflare.domain"');

    const typed = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        config={config}
        manifest={EXPOSURE_CLOUDFLARE}
        values={{ domain: "flymate.dev" }}
      />
    );

    expect(typed).toContain('data-field="exposure.cloudflare.domain"');
    expect(typed).not.toContain('id="exposure.cloudflare.zone"');
  });

  // The wait sits where the gesture was made: the form ends on its button, and
  // the progress follows it, so the click and what it started read together.
  it("place la progression sous le formulaire, à la suite du bouton", () => {
    const html = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        apply={{ moduleId: EXPOSURE_CLOUDFLARE.id, status: "running" }}
        config={{
          answered: {},
          baseline: {},
          held: [],
          moduleId: EXPOSURE_CLOUDFLARE.id,
          status: "ready",
        }}
        manifest={EXPOSURE_CLOUDFLARE}
        name="Cloudflare Tunnel"
        steps={[
          { id: EXPOSURE_CLOUDFLARE.id, ms: 0, status: "running", steps: [] },
        ]}
      />
    );

    const progress = html.indexOf('data-module="exposure.cloudflare"');
    const fields = html.indexOf('data-field="exposure.cloudflare.domain"');
    const button = html.indexOf('type="submit"');

    expect(progress).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(fields);
    expect(progress).toBeGreaterThan(button);
    expect(html).toContain('data-status="running"');
    expect(html).toContain('data-live="duration"');
    expect(html).toContain('aria-busy="true"');
  });

  /** Everything Wrangler is told comes from its account: nothing to type, one gesture left. */
  it("garde le geste d'appliquer pour un module dont toute la valeur vient d'un compte", () => {
    const html = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        config={{
          answered: {},
          baseline: {},
          held: [],
          moduleId: "tool.wrangler",
          status: "ready",
        }}
        manifest={{
          ...EXPOSURE_CLOUDFLARE,
          connection: "wrangler",
          fields: [
            {
              key: "api_token",
              kind: "secret",
              label: "Jeton",
              managed: true,
              required: true,
            },
          ],
          id: "tool.wrangler",
        }}
      />
    );

    expect(text(html)).toContain("Appliquer");
    expect(text(html)).toContain("renvoie le compte connecté");
    expect(html).not.toContain("data-connection=");
    expect(html).not.toContain("elevation-raised grid");
  });

  /** Nothing differs from what the server holds: the gesture has nothing to do, and says so by waiting. */
  it("n'offre d'appliquer qu'une fois quelque chose changé, et alors aussi d'y renoncer", () => {
    const config = {
      answered: { domain: "flymate.dev" },
      baseline: { domain: "flymate.dev" },
      held: [],
      moduleId: EXPOSURE_CLOUDFLARE.id,
      status: "ready" as const,
    };

    const clean = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        config={config}
        dirty={false}
        manifest={EXPOSURE_CLOUDFLARE}
        onDiscard={() => undefined}
        values={{ domain: "flymate.dev" }}
      />
    );

    expect(clean).toContain('data-dirty="false"');
    expect(clean).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);
    expect(text(clean)).not.toContain("Annuler les modifications");

    const changed = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        config={config}
        dirty
        manifest={EXPOSURE_CLOUDFLARE}
        onDiscard={() => undefined}
        values={{ domain: "flymate.studio" }}
      />
    );

    expect(changed).toContain('data-dirty="true"');
    expect(changed).not.toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);
    expect(text(changed)).toContain("Annuler les modifications");
  });

  /** What is refused is said under the field that carries it, and counted at the foot of the form. */
  it("dit sous le champ ce qui est refusé, et le compte au pied du formulaire", () => {
    const html = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        config={{
          answered: { domain: "flymate.dev" },
          baseline: { domain: "flymate.dev" },
          held: [],
          moduleId: EXPOSURE_CLOUDFLARE.id,
          status: "ready",
        }}
        manifest={EXPOSURE_CLOUDFLARE}
        problems={[
          {
            code: "format",
            expected: "domain",
            field: "domain",
            message: "Ce n'est pas un domaine.",
            module: EXPOSURE_CLOUDFLARE.id,
          },
        ]}
        values={{ domain: "pas un domaine" }}
      />
    );

    expect(html).toContain('data-wrong="true"');
    expect(html).toContain('aria-invalid="true"');
    expect(text(html)).toContain("Ce n'est pas un domaine.");
    expect(text(html)).toContain("1 valeur refusée");
  });

  it("ne propose pas de relire quand c'est le serveur entier qui est retenu", () => {
    const html = renderToStaticMarkup(
      <ServiceConfig
        {...props}
        catalogHeld
        manifest={null}
        onReloadCatalog={() => undefined}
      />
    );

    expect(text(html)).toContain("tant que le serveur est retenu");
    expect(text(html)).not.toContain("Relire le catalogue");
  });
});

describe("un écran que l'app n'a pas su dessiner", () => {
  it("le dit, garde ce qui a été levé sous Détails, et propose de recommencer", () => {
    const html = renderToStaticMarkup(
      <ScreenFailure
        detail="Cannot read properties of undefined"
        onRetry={() => undefined}
      />
    );

    expect(html).toContain('data-screen-failure="true"');
    expect(text(html)).toContain("Rien n'a changé sur le serveur");
    expect(text(html)).toContain("Le dessiner à nouveau");
    expect(html.slice(html.indexOf('hidden=""'))).toContain(
      "Cannot read properties"
    );
  });
});
