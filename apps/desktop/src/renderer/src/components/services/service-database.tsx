import { Button } from "@renderer/components/ui/button";
import { CopyField } from "@renderer/components/ui/copy-field";
import { Label } from "@renderer/components/ui/label";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
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

const TITLES: Record<DatabaseOutcome["kind"], DictionaryKey> = {
  dump: "services.database.outcome.dump",
  import: "services.database.outcome.import",
  shell: "services.database.outcome.shell",
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
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-3">
      <Label>{t("services.database.title")}</Label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={SquareTerminal}
          loading={busy === "db.shell"}
          onClick={onShell}
          size="sm"
        >
          {t("services.database.shell")}
        </Button>
        <Button
          icon={Download}
          loading={busy === "db.dump"}
          onClick={onDump}
          size="sm"
        >
          {t("services.database.dump")}
        </Button>
        <Button
          icon={Upload}
          loading={busy === "db.import"}
          onClick={onImport}
          size="sm"
        >
          {t("services.database.import")}
        </Button>
      </div>

      {outcome ? (
        <div className="flex flex-col gap-2" data-outcome={outcome.kind}>
          {outcome.kind === "shell" && outcome.lines[0] ? (
            <>
              <CopyField label={t(TITLES.shell)} value={outcome.lines[0]} />
              {onTerminal ? (
                <div>
                  <Button
                    icon={SquareTerminal}
                    onClick={onTerminal}
                    size="sm"
                    variant="discreet"
                  >
                    {t("services.database.terminal")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="elevation-raised rounded-md border border-line bg-surface p-3">
              <Label>{t(TITLES[outcome.kind])}</Label>
              {outcome.lines.length === 0 ? (
                <p className="mt-1 text-[12px] text-ink-3">
                  {t("services.database.empty")}
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {outcome.lines.map((line) => (
                    <li
                      className="break-all font-data text-[12px] text-ink-2"
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
