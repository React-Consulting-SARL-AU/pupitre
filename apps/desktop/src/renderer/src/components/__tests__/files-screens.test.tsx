import { describe, expect, it } from "bun:test";
import type {
  FileEntry,
  FsStatResult,
} from "@pupitre/shared/agent-protocol/files";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListingState, PreviewState } from "../../stores/files";
import { FileEntryMenu } from "../files/file-entry-menu";
import { FileList } from "../files/file-list";
import { FilePreview } from "../files/file-preview";
import { FileRow } from "../files/file-row";
import { FolderCreate } from "../files/folder-create";
import { FolderCreateDialog } from "../files/folder-create-dialog";

/**
 * What the file browser shows in each of its states. The two panes take
 * everything they draw as props: the store above them is tested on its own.
 */

function entry(
  name: string,
  kind: FileEntry["kind"] = "file",
  size = 1200
): FileEntry {
  return {
    kind,
    mode: "0644",
    modified_at: "2026-09-01T10:00:00Z",
    name,
    size_bytes: size,
  };
}

const ENTRIES = [
  entry("zeta.ts"),
  entry(".env"),
  entry("src", "dir"),
  entry("alpha.ts"),
];

const READ: ListingState = {
  entries: ENTRIES,
  path: "projects/atlas",
  status: "read",
  truncated: false,
};

const STAT: FsStatResult = {
  kind: "file",
  media_type: "text/plain",
  mode: "0644",
  modified_at: "2026-09-01T10:00:00Z",
  path: "projects/atlas/.env",
  size_bytes: 12,
};

const noop = () => undefined;
const later = () => Promise.resolve();

function list(
  listing: ListingState,
  hidden = false,
  selected: string | null = null
) {
  return renderToStaticMarkup(
    <FileList
      editors={[]}
      hidden={hidden}
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
      selected={selected}
      sort="name"
    />
  );
}

function preview(state: PreviewState, draft: string | null = null) {
  return renderToStaticMarkup(
    <FilePreview
      draft={draft}
      leaving={false}
      onClose={noop}
      onConfirmLeave={noop}
      onDownload={later}
      onEdit={noop}
      onReread={later}
      onSave={later}
      onShow={later}
      onStay={noop}
      preview={state}
      write={{ status: "idle" }}
    />
  );
}

function names(html: string): string[] {
  return [...html.matchAll(/data-entry="([^"]+)"/g)].map((found) => found[1]);
}

describe("le nouveau dossier", () => {
  it("se demande depuis l'en-tête, sans champ dans la liste tant qu'on ne l'ouvre pas", () => {
    const html = list(READ);

    expect(html).toContain("Nouveau dossier");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('id="files.newFolder"');
  });

  it("attend un dossier à l'écran avant d'être offert", () => {
    const html = renderToStaticMarkup(
      <FolderCreate disabled name="files.newFolder" onCreate={later} />
    );

    expect(html).toContain("disabled");
  });

  it("s'ouvre en dialogue avec le nom à taper et le bouton Créer", () => {
    const html = renderToStaticMarkup(
      <FolderCreateDialog
        name="files.newFolder"
        onClose={noop}
        onCreate={later}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-dialog="files.newFolder"');
    expect(html).toContain("Nouveau dossier");
    expect(html).toContain('id="files.newFolder"');
    expect(html).toContain("Créer");
    expect(html).toContain("Annuler");
  });
});

describe("la liste d'un dossier", () => {
  it("met les dossiers d'abord et masque les entrées cachées", () => {
    const html = list(READ);

    expect(names(html)).toEqual(["src", "alpha.ts", "zeta.ts"]);
    expect(html).toContain("1 entrée cachée");
    expect(html).toContain('data-kind="dir"');
  });

  it("montre les entrées cachées quand on les demande", () => {
    expect(names(list(READ, true))).toEqual([
      "src",
      ".env",
      "alpha.ts",
      "zeta.ts",
    ]);
  });

  it("porte le fil d'Ariane cliquable, la taille et la date en données", () => {
    const html = list(READ);

    expect(html).toContain("atlas");
    expect(html).toContain("projects");
    expect(html).toContain('aria-current="location"');
    expect(html).toContain("1 Ko");
    expect(html).toContain("tabular-nums");
  });

  it("marque le fichier ouvert à droite", () => {
    const html = list(READ, false, "projects/atlas/alpha.ts");

    expect(html).toContain('data-selected="true"');
    expect(html).toContain('aria-current="true"');
  });

  it("dit qu'un listing est tronqué", () => {
    expect(list({ ...READ, truncated: true })).toContain("2000 premières");
  });

  it("attend avec des lignes fantômes, et dit le refus avec son remède", () => {
    expect(list({ path: "projects", status: "reading" })).toContain(
      'data-skeleton="rows"'
    );

    const failed = list({
      error: {
        code: "bad_request",
        fix: "Listez ce chemin avec fs.list.",
        message: "entrée absente : projects/nowhere",
      },
      path: "projects/nowhere",
      status: "failed",
    });

    expect(failed).toContain("entrée absente : projects/nowhere");
    expect(failed).toContain("Listez ce chemin avec fs.list.");
    expect(failed).toContain("Réessayer");
  });

  it("dit qu'un dossier est vide", () => {
    expect(list({ ...READ, entries: [] })).toContain("Ce dossier est vide");
  });
});

describe("le menu d'une entrée", () => {
  it("s'ouvre depuis un bouton nommé, au clavier comme à la souris", () => {
    const html = renderToStaticMarkup(
      <FileEntryMenu
        actions={[{ id: "open" }, { id: "rename" }]}
        entry={entry("src", "dir")}
        onAct={noop}
        onOpenChange={noop}
        open={false}
        point={null}
      />
    );

    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="Actions sur src"');
    expect(html).toContain('data-tooltip="Actions sur src"');
  });

  it("demande confirmation dans la ligne avant de supprimer, et nomme les entrées retenues", () => {
    const asked = renderToStaticMarkup(
      <FileRow
        editors={[]}
        entry={entry("src", "dir")}
        mode="removing"
        onAct={noop}
        onCancel={noop}
        onOpen={noop}
        onRemove={later}
        onRename={later}
        refusal={null}
        selected={false}
      />
    );

    expect(asked).toContain("Le dossier src est supprimé du serveur.");
    expect(asked).toContain("Annuler");

    const held = renderToStaticMarkup(
      <FileRow
        editors={[]}
        entry={entry("src", "dir")}
        mode="removing"
        onAct={noop}
        onCancel={noop}
        onOpen={noop}
        onRemove={later}
        onRename={later}
        refusal={{
          code: "bad_request",
          fix: "Rappelez fs.remove avec recursive: true.",
          message: "dossier non vide : src contient 14 entrées",
        }}
        selected={false}
      />
    );

    expect(held).toContain("dossier non vide : src contient 14 entrées");
    expect(held).toContain("Supprimer le dossier et ses 14 entrées");
  });

  it("renomme en place, avec un champ nommé d'après l'entrée", () => {
    const html = renderToStaticMarkup(
      <FileRow
        editors={[]}
        entry={entry("alpha.ts")}
        mode="renaming"
        onAct={noop}
        onCancel={noop}
        onOpen={noop}
        onRemove={later}
        onRename={later}
        refusal={null}
        selected={false}
      />
    );

    expect(html).toContain('aria-label="Nouveau nom pour alpha.ts"');
    expect(html).toContain('value="alpha.ts"');
  });
});

describe("l'aperçu d'un fichier", () => {
  it("n'a rien à montrer tant qu'aucun fichier n'est choisi", () => {
    expect(preview({ status: "idle" })).toContain("Aucun fichier ouvert");
  });

  it("ouvre un texte dans l'éditeur, avec Enregistrer inactif tant que rien n'a changé", () => {
    const html = preview({
      path: "projects/atlas/.env",
      sha256: "a".repeat(64),
      stat: STAT,
      status: "text",
      text: "PORT=3000\n",
    });

    expect(html).toContain('data-editor="projects/atlas/.env"');
    expect(html).toContain("Enregistrer");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Modifié, non enregistré");
  });

  it("marque un tampon modifié d'un point et arme Enregistrer", () => {
    const html = preview(
      {
        path: "projects/atlas/.env",
        sha256: "a".repeat(64),
        stat: STAT,
        status: "text",
        text: "PORT=3000\n",
      },
      "PORT=3100\n"
    );

    expect(html).toContain("Modifié, non enregistré");
    expect(html).not.toContain('disabled=""');
  });

  it("montre la fiche d'un fichier trop lourd et dit qu'il se télécharge, sans geste factice", () => {
    const html = preview({
      error: {
        code: "bad_request",
        fix: "Téléchargez ce fichier au lieu de le lire.",
        message:
          "fichier trop lourd : 2097152 octets pour un maximum de 1048576",
      },
      path: "projects/atlas/dump.log",
      stat: { ...STAT, path: "projects/atlas/dump.log", size_bytes: 2_097_152 },
      status: "unreadable",
    });

    expect(html).toContain("2,0 Mo");
    expect(html).toContain("text/plain");
    expect(html).toContain("0644");
    expect(html).toContain("fichier trop lourd");
    expect(html).toContain("Téléchargez ce fichier au lieu de le lire.");
    expect(html).toMatch(
      /<button[^>]*data-tooltip="Enregistrer sur cet ordinateur"[^>]*>[^<]*<svg[^>]*>.*?<\/svg>Télécharger/
    );
    expect(html).not.toMatch(
      /<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>.*?<\/svg>Télécharger/
    );
  });

  it("montre la fiche d'un type que l'app n'affiche pas", () => {
    const html = preview({
      error: null,
      path: "projects/atlas/site.zip",
      stat: { ...STAT, media_type: undefined, path: "projects/atlas/site.zip" },
      status: "unreadable",
    });

    expect(html).toContain("Non affiché par l&#x27;app");
    expect(html).toContain("Ce fichier ne s&#x27;affiche pas ici");
  });

  it("affiche une image avec son nom pour texte de remplacement", () => {
    const html = preview({
      mediaType: "image/png",
      path: "projects/atlas/logo.png",
      sha256: "a".repeat(64),
      size: { height: 32, width: 64 },
      stat: {
        ...STAT,
        media_type: "image/png",
        path: "projects/atlas/logo.png",
      },
      status: "image",
      url: "blob:logo",
    });

    expect(html).toContain('alt="Image logo.png"');
    expect(html).toContain('src="blob:logo"');
    expect(html).toContain('width="64"');
  });
});
