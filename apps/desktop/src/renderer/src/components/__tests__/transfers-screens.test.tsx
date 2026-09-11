import { describe, expect, it } from "bun:test";
import type { Transfer } from "@shared/transfers";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListingState } from "../../stores/files";
import { FileList } from "../files/file-list";
import { ServiceDatabase } from "../services/service-database";
import { TransferRow } from "../shell/transfer-row";
import { TransfersList } from "../shell/transfers-list";

/**
 * What the transfers panel and the drop zone show in each of their states.
 * Everything drawn comes as props: the store above them is tested on its own.
 */

const noop = () => undefined;
const later = () => Promise.resolve();

function transfer(patch: Partial<Transfer> = {}): Transfer {
  return {
    attempt: 1,
    direction: "upload",
    done: 104_857_600,
    endedAt: null,
    error: null,
    id: "t1",
    kind: "file",
    localPath: "/Users/jean/Downloads/shop.sql",
    name: "shop.sql",
    rate: 12_340_000,
    remaining: 7,
    remotePath: "dumps/shop.sql",
    serverId: "srv-1",
    startedAt: 0,
    status: "running",
    tool: "rsync",
    total: 209_715_200,
    ...patch,
  };
}

function row(patch: Partial<Transfer> = {}): string {
  return renderToStaticMarkup(
    <TransferRow
      onCancel={later}
      onDismiss={later}
      onPause={later}
      onResume={later}
      transfer={transfer(patch)}
    />
  );
}

function shapeOf(html: string): string | null {
  return /data-shape="([a-z]+)"/.exec(html)?.[1] ?? null;
}

function list(listing: ListingState): string {
  return renderToStaticMarkup(
    <FileList
      editors={[]}
      hidden={false}
      listing={listing}
      onAct={noop}
      onBrowse={later}
      onCreate={later}
      onDismiss={noop}
      onDrop={later}
      onHidden={noop}
      onRefresh={later}
      onRemove={later}
      onRename={later}
      onShow={later}
      onSort={noop}
      onUpload={later}
      problem={null}
      removal={null}
      rootLabel="atlas"
      selected={null}
      sort="name"
    />
  );
}

describe("une ligne de transfert", () => {
  it("respire en cours, avec les octets, le débit et le temps restant", () => {
    const html = row();

    expect(shapeOf(html)).toBe("breathing");
    expect(html).toContain('data-direction="upload"');
    expect(html).toContain("Envoi vers le serveur");
    expect(html).toContain("100,0 Mo sur 200,0 Mo");
    expect(html).toContain("11,8 Mo/s");
    expect(html).toContain("7 s restantes");
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-label="Mettre shop.sql en pause"');
    expect(html).toContain('aria-label="Annuler shop.sql"');
    expect(html).not.toContain("Reprendre");
  });

  it("attend son tour, cerclé", () => {
    const html = row({
      done: 0,
      rate: null,
      remaining: null,
      status: "queued",
    });

    expect(shapeOf(html)).toBe("ringed");
    expect(html).toContain("En attente de son tour");
  });

  it("en pause, vide, et offre de reprendre", () => {
    const html = row({ rate: null, remaining: null, status: "paused" });

    expect(shapeOf(html)).toBe("empty");
    expect(html).toContain("En pause");
    expect(html).toContain("100,0 Mo sur 200,0 Mo");
    expect(html).toContain('aria-label="Reprendre shop.sql"');
    expect(html).not.toContain("Mettre shop.sql en pause");
  });

  it("terminé, plein, ne garde que le retrait", () => {
    const html = row({ done: 209_715_200, endedAt: 1, status: "done" });

    expect(shapeOf(html)).toBe("filled");
    expect(html).toContain("Terminé");
    expect(html).toContain('aria-label="Retirer shop.sql de la liste"');
    expect(html).not.toContain("progressbar");
    expect(html).not.toContain("Annuler shop.sql");
  });

  it("arrêté, barré, avec le remède du main", () => {
    const html = row({
      endedAt: 1,
      error: {
        code: "internal",
        message: "refusal.transfer.network",
        phrase: { id: "refusal.transfer.network", values: { max: 5 } },
      },
      status: "failed",
    });

    expect(shapeOf(html)).toBe("struck");
    expect(html).toContain("Arrêté");
    expect(html).toContain("coupée 5 fois de suite");
    expect(html).toContain("ce qui est arrivé est gardé");
  });

  it("dit qu'un transfert par scp ne reprend pas, et avance sans chiffre quand il n'en a pas", () => {
    const html = row({
      direction: "download",
      rate: null,
      remaining: null,
      tool: "scp",
      total: null,
    });

    expect(html).toContain("ne reprend pas là où il s&#x27;est arrêté");
    expect(html).toContain("Téléchargement vers cet ordinateur");
    expect(html).toContain("100,0 Mo transmis");
    expect(html).not.toContain("aria-valuenow");
    expect(html).toContain("animate-breathe");
  });
});

describe("le volet des transferts", () => {
  function panel(transfers: Transfer[]): string {
    return renderToStaticMarkup(
      <TransfersList
        onCancel={later}
        onDismiss={later}
        onDismissProblem={noop}
        onPause={later}
        onResume={later}
        problem={null}
        transfers={transfers}
      />
    );
  }

  it("ne dessine rien quand la file est vide", () => {
    expect(panel([])).toBe("");
  });

  it("compte ce qui bouge et liste chaque transfert", () => {
    const html = panel([
      transfer(),
      transfer({ id: "t2", name: "site", status: "queued" }),
      transfer({ id: "t3", name: "old.sql", status: "done" }),
    ]);

    expect(html).toContain('data-transfers="3"');
    expect(html).toContain('data-transfers-moving="2"');
    expect(html).toContain("2 en cours");
    expect(html).toContain('aria-label="Afficher ou masquer les transferts"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-transfer="t1"');
    expect(html).toContain('data-transfer="t3"');
  });
});

describe("la zone de dépôt du navigateur de fichiers", () => {
  it("offre d'envoyer dans le dossier affiché et nomme sa zone", () => {
    const html = list({
      entries: [],
      path: "projects/atlas",
      status: "read",
      truncated: false,
    });

    expect(html).toContain('aria-label="Zone de dépôt du dossier"');
    expect(html).toContain("Envoyer…");
    expect(html).toContain(
      'title="Envoyer des fichiers ou des dossiers dans ce dossier"'
    );
    expect(html).not.toContain("data-dropping");
  });

  it("n'offre pas d'envoyer tant que le dossier n'est pas lu", () => {
    const html = list({ path: "projects/atlas", status: "reading" });

    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>.*?<\/svg>Envoyer…/
    );
  });
});

describe("le panneau base de données", () => {
  function panel(
    outcome: {
      kind: "dump" | "import";
      lines: string[];
      bytes?: number;
    } | null,
    pending: {
      transferId: string;
      name: string;
      serverId: string;
      moduleId: string;
    }[] = []
  ): string {
    return renderToStaticMarkup(
      <ServiceDatabase
        busy={null}
        dumps={{ status: "idle" }}
        onDownloadDump={later}
        onDump={later}
        onImport={later}
        onImportFromComputer={later}
        onReadDumps={later}
        onRemoveDump={later}
        onRestoreDump={later}
        onShell={later}
        outcome={outcome}
        pendingImports={pending}
      />
    );
  }

  it("offre de télécharger le dump que l'agent vient d'écrire", () => {
    const html = panel({
      bytes: 5_000_000,
      kind: "dump",
      lines: ["/home/dev/dumps/shop-2026.sql.gz"],
    });

    expect(html).toContain("Télécharger le dump");
    expect(html).toContain("Importer un dump depuis mon ordinateur");
  });

  it("dit qu'un dump envoyé attend d'arriver avant l'import", () => {
    const html = panel(null, [
      {
        moduleId: "db.postgres",
        name: "shop.sql",
        serverId: "srv-1",
        transferId: "t1",
      },
    ]);

    expect(html).toContain("En attente de l&#x27;arrivée du fichier");
    expect(html).toContain("shop.sql");
    expect(html).not.toContain("Télécharger le dump");
  });
});
