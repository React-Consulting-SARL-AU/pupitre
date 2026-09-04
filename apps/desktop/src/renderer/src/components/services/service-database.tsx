import { Button } from "@renderer/components/ui/button";
import { CopyField } from "@renderer/components/ui/copy-field";
import { Label } from "@renderer/components/ui/label";
import { humanBytes } from "@renderer/lib/duration";
import type { DatabaseOutcome } from "@renderer/stores/services";
import { Download, SquareTerminal, Upload } from "lucide-react";

/**
 * The three gestures a database accepts, and what each one answered.
 *
 * The shell is a command the agent composed for its own machine: the app shows
 * it to be pasted in a terminal rather than running it here, because a shell is
 * a session and this panel is a page.
 */

const TITLES: Record<DatabaseOutcome["kind"], string> = {
  dump: "Export écrit sur le serveur",
  import: "Dumps importés",
  shell: "Commande à lancer sur le serveur",
};

export function ServiceDatabase({
  outcome,
  busy,
  onShell,
  onDump,
  onImport,
  onTerminal,
}: {
  outcome: DatabaseOutcome | null;
  /** The command in flight, as the protocol names it. */
  busy: string | null;
  onShell: () => void;
  onDump: () => void;
  onImport: () => void;
  onTerminal?: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Label>Base de données</Label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={SquareTerminal}
          loading={busy === "db.shell"}
          onClick={onShell}
          size="sm"
        >
          Ouvrir un shell
        </Button>
        <Button
          icon={Download}
          loading={busy === "db.dump"}
          onClick={onDump}
          size="sm"
        >
          Exporter
        </Button>
        <Button
          icon={Upload}
          loading={busy === "db.import"}
          onClick={onImport}
          size="sm"
        >
          Importer les dumps déposés
        </Button>
      </div>

      {outcome ? (
        <div className="flex flex-col gap-2" data-outcome={outcome.kind}>
          {outcome.kind === "shell" && outcome.lines[0] ? (
            <>
              <CopyField label={TITLES.shell} value={outcome.lines[0]} />
              {onTerminal ? (
                <div>
                  <Button
                    icon={SquareTerminal}
                    onClick={onTerminal}
                    size="sm"
                    variant="discreet"
                  >
                    Ouvrir un terminal sur le serveur
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border border-line bg-surface px-3 py-2.5">
              <Label>{TITLES[outcome.kind]}</Label>
              {outcome.lines.length === 0 ? (
                <p className="mt-1 text-[11px] text-ink-3">
                  Aucun dump à importer dans le dossier du serveur.
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {outcome.lines.map((line) => (
                    <li
                      className="break-all font-data text-[11px] text-ink-2"
                      key={line}
                    >
                      {line}
                      {outcome.bytes === undefined
                        ? null
                        : ` · ${humanBytes(outcome.bytes)}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
