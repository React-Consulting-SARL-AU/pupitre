import { describe, expect, it } from "bun:test";
import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import type { Server } from "@shared/servers";
import type { PortForward, ServiceDetail } from "@shared/services";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import type { PaletteEntry } from "../../lib/palette";
import { isMac } from "../../lib/platform";
import { shortcutSheet } from "../../lib/shortcut-sheet";
import { refusedField, ServerRowEdit } from "../servers/server-row-edit";
import { ServiceControls } from "../services/service-controls";
import { ServiceDatabase } from "../services/service-database";
import { ServiceDumpRow } from "../services/service-dump-row";
import { ServiceForward } from "../services/service-forward";
import { CommandPalette } from "../shell/command-palette";
import { ForwardsList } from "../shell/forwards-list";
import { ServerSwitch } from "../shell/server-switch";
import { ShortcutsDialog } from "../shell/shortcuts-dialog";
import { SignOutDialog } from "../shell/sign-out-dialog";

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

describe("a service's gestures", () => {
  it("offer a stop to a running service, and a start to a fallen one", () => {
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

  it("put the in-flight command's button on hold, and only that one", () => {
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

describe("a service's database", () => {
  it("lists the server's dumps with their size and the database they feed", () => {
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

  it("says no dump is there rather than saying nothing", () => {
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

  it("confirms a restore by naming the database", () => {
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

describe("local forwards", () => {
  it("are listed in the sidebar with their address and their close control", () => {
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

  it("draw nothing when none is open", () => {
    expect(
      renderToStaticMarkup(
        <ForwardsList forwards={[]} nameOf={() => null} onClose={later} />
      )
    ).toBe("");
  });

  it("say on the service page when the usual port has moved", () => {
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

describe("editing a server", () => {
  it("carries the three fields, the note and a save held back while nothing has changed", () => {
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

  it("carries the server's SSH name, and says what ssh will type", () => {
    const html = renderToStaticMarkup(
      <ServerRowEdit
        busy={false}
        error={null}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        server={{ ...SERVER, slug: "atelier-prod" }}
      />
    );

    expect(html).toContain('id="server-edit-srv-1-slug"');
    expect(html).toContain('value="atelier-prod"');
    expect(text(html)).toContain("ssh atelier-prod");
  });

  it("suggests the server name when no SSH name is set, without writing it", () => {
    const html = renderToStaticMarkup(
      <ServerRowEdit
        busy={false}
        error={null}
        onCancel={() => undefined}
        onSubmit={() => undefined}
        server={SERVER}
      />
    );

    expect(html).toContain('placeholder="atelier"');
    expect(text(html)).toContain("ssh atelier");
  });

  it("marks the SSH name another machine already carries", () => {
    const error = {
      code: "bad_request" as const,
      message: "refusal.setup.sshNameTaken",
      phrase: { id: "refusal.setup.sshNameTaken", values: { name: "atelier" } },
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

    expect(refusedField(error)).toBe("slug");
    expect(html).toContain(
      'aria-describedby="server-edit-srv-1-slug-help server-edit-srv-1-slug-problem"'
    );
    expect(text(html)).toContain("désigne déjà une autre machine");
  });

  it("marks the field the main process refused", () => {
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

describe("the server switch", () => {
  it("names the driven server and lists the others with their shape", () => {
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

describe("the palette", () => {
  const ENTRIES: PaletteEntry[] = [
    { id: "dashboard", kind: "view", label: "Tableau de bord" },
    {
      hint: "online",
      id: "flyleaf-api",
      kind: "project",
      label: "flyleaf-api",
    },
  ];

  it("is a dialog that carries a list, the first entry selected", async () => {
    const view = await mount(
      <CommandPalette
        entries={ENTRIES}
        onClose={() => undefined}
        onPick={() => undefined}
        open
      />
    );
    const html = view.html();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('data-palette-entry="view:dashboard"');
    expect(html).toContain('data-palette-entry="project:flyleaf-api"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(text(html)).toContain("2 résultats");
    expect(document.activeElement?.getAttribute("role")).toBe("combobox");

    view.unmount();
  });

  it("draws nothing when closed", () => {
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

describe("the shortcuts sheet", () => {
  it("lists each group with its keys, written for this keyboard", async () => {
    let closed = 0;
    const view = await mount(
      <ShortcutsDialog
        onClose={() => {
          closed += 1;
        }}
        open
      />
    );
    const html = view.html();
    const shown = text(html);

    const caps = [
      ...document.querySelectorAll('[data-dialog="shortcuts"] kbd'),
    ].map((cap) => cap.textContent);

    expect(html).toContain('data-dialog="shortcuts"');

    for (const group of shortcutSheet(isMac)) {
      expect(html).toContain(`data-section="${group.name}"`);

      for (const line of group.shortcuts) {
        expect(caps).toContain(line.keys[0]);
      }
    }

    expect(shown).toContain("Nouveau terminal dans le projet affiché");
    expect(shown).toContain("Onglet par son rang");

    await view.click(
      [...document.querySelectorAll("[data-dialog] button")].find(
        (button) => button.textContent === "Fermer"
      ) ?? null
    );

    expect(closed).toBe(1);

    view.unmount();
  });
});

describe("the sign-out requested by the menu", () => {
  it("is confirmed in the window before doing anything", async () => {
    const view = await mount(
      <SignOutDialog onCancel={() => undefined} onConfirm={later} open />
    );
    const html = view.html();

    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain("Se déconnecter de ce compte ?");
    expect(text(html)).toContain("Annuler");

    view.unmount();
  });
});
