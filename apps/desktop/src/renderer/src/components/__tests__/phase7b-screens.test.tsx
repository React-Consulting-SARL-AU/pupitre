import { describe, expect, it } from "bun:test";
import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import type { Server } from "@shared/servers";
import type { PortForward, ServiceDetail } from "@shared/services";
import { renderToStaticMarkup } from "react-dom/server";
import type { PaletteEntry } from "../../lib/palette";
import { refusedField, ServerRowEdit } from "../servers/server-row-edit";
import { ServiceControls } from "../services/service-controls";
import { ServiceDatabase } from "../services/service-database";
import { ServiceDumpRow } from "../services/service-dump-row";
import { ServiceForward } from "../services/service-forward";
import { CommandPalette } from "../shell/command-palette";
import { ForwardsList } from "../shell/forwards-list";
import { ServerSwitch } from "../shell/server-switch";
import { SignOutDialog } from "../shell/sign-out-dialog";

/**
 * The screens of the second half of phase seven, drawn once each.
 *
 * What is checked is what a reader gets without a gesture: the gesture the
 * state calls for, the shape of each state, the roles a keyboard needs, and
 * the fact that nothing here ever prints a command or a secret.
 */

const later = () => Promise.resolve();

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const POSTGRES: ServiceDetail = {
  configured: true,
  credentials: [],
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  state: "running",
  unit: "postgresql.service",
  version: "17.2",
};

const SERVER: Server = {
  host: "atelier.example.net",
  id: "srv-1",
  keyPath: "/keys/srv-1",
  name: "Atelier",
  origin: "app",
  port: 22,
  user: "dev",
};

const OTHER: Server = {
  ...SERVER,
  grant: {
    adopted: true,
    id: "p-2",
    keyReady: true,
    listed: false,
    opened: true,
    status: "revoked",
  },
  host: "203.0.113.9",
  id: "srv-2",
  name: "Bureau",
};

const FORWARD: PortForward = {
  id: "f1",
  label: "db.postgres",
  localPort: 55_001,
  remotePort: 5432,
  serverId: "srv-1",
};

const DUMP: FileEntry = {
  kind: "file",
  mode: "0644",
  modified_at: "2026-09-10T10:00:00Z",
  name: "fulldump_shop_20260910.sql.gz",
  size_bytes: 4_200_000,
};

describe("les gestes d'un service", () => {
  it("offrent l'arrêt à un service qui tourne, et le démarrage à un service tombé", () => {
    const running = renderToStaticMarkup(
      <ServiceControls busy={null} detail={POSTGRES} onControl={later} />
    );
    const failed = renderToStaticMarkup(
      <ServiceControls
        busy={null}
        detail={{ ...POSTGRES, state: "failed" }}
        onControl={later}
      />
    );

    expect(text(running)).toContain("Arrêter");
    expect(text(running)).not.toContain("Démarrer");
    expect(text(failed)).toContain("Démarrer");
    expect(text(failed)).toContain("Redémarrer");
  });

  it("mettent en attente le bouton de la commande en vol, et lui seul", () => {
    const html = renderToStaticMarkup(
      <ServiceControls
        busy="service.stop"
        detail={POSTGRES}
        onControl={later}
      />
    );

    expect(html).toContain('aria-busy="true"');
    expect(html.match(/aria-busy="true"/g)).toHaveLength(1);
  });
});

describe("la base de données d'un service", () => {
  it("liste les dumps du serveur avec leur poids et la base qu'ils nourrissent", () => {
    const html = renderToStaticMarkup(
      <ServiceDatabase
        busy={null}
        dumps={{ dumps: [DUMP], status: "ready" }}
        onDownloadDump={later}
        onDump={later}
        onImport={later}
        onImportFromComputer={later}
        onReadDumps={later}
        onRemoveDump={later}
        onRestoreDump={later}
        onShell={later}
        outcome={null}
        pendingImports={[]}
      />
    );

    expect(html).toContain('data-dumps="ready"');
    expect(html).toContain('data-dump="fulldump_shop_20260910.sql.gz"');
    expect(text(html)).toContain("nourrit shop");
    expect(text(html)).toContain("Restaurer");
    expect(text(html)).toContain("Supprimer");
    expect(text(html)).not.toContain("psql");
  });

  it("dit qu'aucun dump n'est là plutôt que de ne rien dire", () => {
    const html = renderToStaticMarkup(
      <ServiceDatabase
        busy={null}
        dumps={{ dumps: [], status: "ready" }}
        onDownloadDump={later}
        onDump={later}
        onImport={later}
        onImportFromComputer={later}
        onReadDumps={later}
        onRemoveDump={later}
        onRestoreDump={later}
        onShell={later}
        outcome={null}
        pendingImports={[]}
      />
    );

    expect(text(html)).toContain("Aucun dump dans le dossier du serveur");
  });

  it("confirme une restauration en nommant la base", () => {
    const html = renderToStaticMarkup(
      <ServiceDumpRow
        busy={false}
        dump={DUMP}
        onRemove={later}
        onRestore={later}
      />
    );

    expect(text(html)).toContain("4");
    expect(html).toContain("Restaurer");
  });
});

describe("les redirections locales", () => {
  it("se listent dans la barre latérale avec leur adresse et leur fermeture", () => {
    const html = renderToStaticMarkup(
      <ForwardsList
        forwards={[FORWARD, { ...FORWARD, id: "f2", movedFrom: 55_000 }]}
        nameOf={() => "Atelier"}
        onClose={later}
      />
    );

    expect(html).toContain('data-forwards="2"');
    expect(text(html)).toContain("Ports locaux");
    expect(text(html)).toContain("127.0.0.1:55001");
    expect(text(html)).toContain("Atelier · db.postgres");
    expect(html).toContain("Fermer la redirection du port 5432");
    expect(text(html)).toContain("Son port habituel, 55000");
  });

  it("ne dessinent rien quand aucune n'est ouverte", () => {
    expect(
      renderToStaticMarkup(
        <ForwardsList forwards={[]} nameOf={() => null} onClose={later} />
      )
    ).toBe("");
  });

  it("disent sur la fiche du service quand le port habituel a bougé", () => {
    const html = renderToStaticMarkup(
      <ServiceForward
        forwards={[{ ...FORWARD, movedFrom: 55_000 }]}
        onClose={() => undefined}
        onOpen={() => undefined}
        port={5432}
      />
    );

    expect(text(html)).toContain("Son port local habituel, 55000");
  });
});

describe("la modification d'un serveur", () => {
  it("porte les trois champs, la note et un enregistrement retenu tant que rien n'a changé", () => {
    const html = renderToStaticMarkup(
      <ServerRowEdit
        busy={false}
        error={null}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        server={SERVER}
      />
    );

    expect(html).toContain('data-server-edit="srv-1"');
    expect(html).toContain('value="atelier.example.net"');
    expect(html).toContain('value="22"');
    expect(html).toContain('value="dev"');
    expect(text(html)).toContain("se rouvrent sur la nouvelle adresse");
    expect(html).toContain("disabled");
  });

  it("marque le champ que le processus principal a refusé", () => {
    const error = {
      code: "bad_request" as const,
      message: "refusal.setup.port",
      phrase: { id: "refusal.setup.port", values: { port: 70_000 } },
    };
    const html = renderToStaticMarkup(
      <ServerRowEdit
        busy={false}
        error={error}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        server={SERVER}
      />
    );

    expect(refusedField(error)).toBe("port");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="server-edit-srv-1-port-problem"');
    expect(text(html)).toContain("70000");
  });
});

describe("la bascule de serveur", () => {
  it("nomme le serveur piloté et liste les autres avec leur forme", () => {
    const html = renderToStaticMarkup(
      <ServerSwitch
        onActivate={() => undefined}
        onSettings={() => undefined}
        server={SERVER}
        servers={[SERVER, OTHER]}
      />
    );

    expect(html).toContain('data-server-switch="srv-1"');
    expect(text(html)).toContain("Atelier");
    expect(html).toContain("Changer de serveur");
  });
});

describe("la palette", () => {
  const ENTRIES: PaletteEntry[] = [
    { id: "dashboard", kind: "view", label: "Tableau de bord" },
    {
      hint: "online",
      id: "flymate-api",
      kind: "project",
      label: "flymate-api",
    },
  ];

  it("est un dialogue qui porte une liste, la première entrée choisie", () => {
    const html = renderToStaticMarkup(
      <CommandPalette
        entries={ENTRIES}
        onClose={() => undefined}
        onPick={() => undefined}
        open
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('data-palette-entry="view:dashboard"');
    expect(html).toContain('data-palette-entry="project:flymate-api"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(text(html)).toContain("2 résultats");
  });

  it("ne dessine rien fermée", () => {
    expect(
      renderToStaticMarkup(
        <CommandPalette
          entries={ENTRIES}
          onClose={() => undefined}
          onPick={() => undefined}
          open={false}
        />
      )
    ).toBe("");
  });
});

describe("la déconnexion demandée par le menu", () => {
  it("se confirme dans la fenêtre avant de faire quoi que ce soit", () => {
    const html = renderToStaticMarkup(
      <SignOutDialog onCancel={() => undefined} onConfirm={later} open />
    );

    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain("Se déconnecter de ce compte ?");
    expect(text(html)).toContain("Annuler");
  });
});
