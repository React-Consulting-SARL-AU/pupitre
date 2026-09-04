import {
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@pupitre/shared/agent-protocol/state";
import { FolderPlus } from "lucide-react";
import type { Draft } from "../../stores/first-project";
import { Button } from "../ui/button";
import { Field, fieldControlClass } from "../ui/field";

/**
 * What the agent needs to know about a project, asked once.
 *
 * The address fills the rest in: the name comes off its last segment, the port
 * is one no declared project holds, the start command follows the package
 * manager. Everything proposed here stays editable — the machine decides what
 * it accepts, and says so.
 */
export interface DraftEdits {
  source: (value: string) => void;
  name: (value: string) => void;
  pkgmgr: (value: PackageManager) => void;
  port: (value: number) => void;
  subdomain: (value: string) => void;
  cmd: (value: string) => void;
}

export function FirstProjectForm({
  draft,
  detected,
  cloudflare,
  ready,
  edit,
  onSubmit,
}: {
  draft: Draft;
  /** The package manager came from a project the agent already declares. */
  detected: boolean;
  cloudflare: boolean;
  ready: boolean;
  edit: DraftEdits;
  onSubmit: () => void;
}) {
  return (
    <form
      className="elevation-raised flex flex-col gap-gutter rounded-md border border-line bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field
        help="L'adresse d'un dépôt git, ou le chemin d'un dossier déjà présent sur le serveur."
        label="Source"
      >
        <input
          className={fieldControlClass}
          onChange={(event) => edit.source(event.target.value)}
          placeholder="https://github.com/moi/mon-site.git"
          value={draft.source}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          help={draft.dir ? `Dossier : ${draft.dir}` : "Déduit de la source."}
          label="Nom"
        >
          <input
            className={fieldControlClass}
            onChange={(event) => edit.name(event.target.value)}
            placeholder="mon-site"
            value={draft.name}
          />
        </Field>

        <Field
          help={
            detected
              ? "Détecté : le serveur déclare déjà ce projet."
              : "Il donne aussi la commande d'installation des dépendances."
          }
          label="Gestionnaire de paquets"
        >
          <select
            className={fieldControlClass}
            onChange={(event) =>
              edit.pkgmgr(event.target.value as PackageManager)
            }
            value={draft.pkgmgr}
          >
            {PACKAGE_MANAGERS.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </select>
        </Field>

        <Field
          help="Libre d'après les projets que l'agent déclare."
          label="Port"
        >
          <input
            className={fieldControlClass}
            inputMode="numeric"
            onChange={(event) => edit.port(event.target.valueAsNumber)}
            type="number"
            value={Number.isFinite(draft.port) ? draft.port : ""}
          />
        </Field>

        {cloudflare ? (
          <Field
            help="Le tunnel Cloudflare installé publie le projet sous ce nom."
            label="Sous-domaine"
          >
            <input
              className={fieldControlClass}
              onChange={(event) => edit.subdomain(event.target.value)}
              placeholder={draft.name}
              value={draft.subdomain}
            />
          </Field>
        ) : null}
      </div>

      <Field
        help="Lancée depuis le dossier du projet, dans la session de l'agent."
        label="Commande de démarrage"
      >
        <input
          className={fieldControlClass}
          onChange={(event) => edit.cmd(event.target.value)}
          placeholder="bun run dev --port 3000"
          value={draft.cmd}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button disabled={!ready} icon={FolderPlus} submit variant="inverse">
          Créer le projet
        </Button>
      </div>
    </form>
  );
}
