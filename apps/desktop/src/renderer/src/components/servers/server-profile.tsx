import { cleanProfile, EDITORS, type ServerProfile } from "@shared/profile";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Field, fieldControlClass } from "../ui/field";
import { Label } from "../ui/label";

/**
 * What differs from one machine to another, and that nothing lets us guess.
 *
 * Collapsed by default: the defaults describe the starter stack, and someone
 * who changed nothing has nothing to read here. The draft is committed by hand
 * rather than on every keystroke, because saving closes the open channels.
 */
const FREE = "__free__";
const NONE = "__none__";

function editorChoice(profile: ServerProfile): string {
  if (!profile.editor) {
    return NONE;
  }

  const known = EDITORS.find((e) => e.url === profile.editor);

  return known ? known.name : FREE;
}

export function ServerProfileFields({
  profile,
  busy,
  onSave,
}: {
  profile: ServerProfile | undefined;
  busy: boolean;
  onSave: (profile: ServerProfile) => void;
}) {
  const saved = cleanProfile(profile);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ServerProfile>(saved);

  const choice = editorChoice(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  function change(field: keyof ServerProfile, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function pickEditor(value: string) {
    if (value === NONE) {
      change("editor", "");
      return;
    }

    if (value === FREE) {
      change("editor", draft.editor || "myeditor://{host}{root}/{repo}");
      return;
    }

    const found = EDITORS.find((e) => e.name === value);
    if (found) {
      setDraft((d) => ({ ...d, editor: found.url, editorName: found.name }));
    }
  }

  return (
    <div className="mt-4 pl-7">
      <button
        className="flex items-center gap-1 rounded-sm text-ink-3 transition-soft hover:text-ink"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={1.5} />
        ) : (
          <ChevronRight size={12} strokeWidth={1.5} />
        )}
        <Label>Avancé</Label>
      </button>

      {open ? (
        <div className="mt-3 animate-[fade-in_160ms_ease-out]">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field help="ce que l'app appelle sur le serveur" label="Commande">
              <input
                className={fieldControlClass}
                onChange={(e) => change("command", e.target.value)}
                placeholder="dev"
                value={draft.command}
              />
            </Field>

            <Field help="« {project} » est remplacé" label="Journaux">
              <input
                className={fieldControlClass}
                onChange={(e) => change("logs", e.target.value)}
                placeholder="~/.dev-stack/logs/{project}.log"
                value={draft.logs}
              />
            </Field>

            <Field
              help="ouvre le dossier distant depuis une page de projet"
              label="Éditeur"
            >
              <select
                className={fieldControlClass}
                onChange={(e) => pickEditor(e.target.value)}
                value={choice}
              >
                {EDITORS.map((editor) => (
                  <option key={editor.name} value={editor.name}>
                    {editor.name}
                  </option>
                ))}
                <option value={NONE}>Aucun</option>
                <option value={FREE}>Autre…</option>
              </select>
              {choice === FREE ? (
                <>
                  <input
                    className={`${fieldControlClass} mt-1`}
                    onChange={(e) => change("editorName", e.target.value)}
                    placeholder="Libellé du bouton"
                    value={draft.editorName}
                  />
                  <input
                    className={`${fieldControlClass} mt-1`}
                    onChange={(e) => change("editor", e.target.value)}
                    placeholder="myeditor://{host}{root}/{repo}"
                    value={draft.editor}
                  />
                </>
              ) : null}
            </Field>

            <Field
              help="lancé depuis cet ordinateur quand rien n'est configuré"
              label="Script d'installation"
            >
              <input
                className={fieldControlClass}
                onChange={(e) => change("installer", e.target.value)}
                placeholder="aucun"
                value={draft.installer}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Button
              disabled={!changed}
              loading={busy}
              onClick={() => onSave(draft)}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
