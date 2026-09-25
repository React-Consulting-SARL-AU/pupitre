import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { humanBytes } from "@renderer/lib/duration";
import type {
  DatabaseOutcome,
  DumpsState,
  PendingImport,
} from "@renderer/stores/services";
import {
  Download,
  HardDriveDownload,
  HardDriveUpload,
  List,
  RefreshCw,
  SquareTerminal,
  Upload,
} from "lucide-react";
import { WaitingLine } from "../ui/waiting-line";
import { ServiceDumpRow } from "./service-dump-row";

/**
 * The gestures a database accepts, and what each one answered.
 *
 * The shell opens as a terminal tab: the main process asks the agent for the
 * command and runs it there, and this page never sees the line. A dump written
 * on the server comes to this computer on its own transfer, and a dump of this
 * computer goes up the same way before it is imported: a file of several
 * gigabytes never rides the agent's channel. The dumps already on the server
 * are listed from the folder they live in, each with its way back.
 *
 * The databases themselves are not listed: the contract has no command that
 * names them, and the app invents nothing the agent did not say.
 */

const TITLES: Record<DatabaseOutcome["kind"], DictionaryKey> = {
  dump: "services.database.outcome.dump",
  import: "services.database.outcome.import",
};

export function ServiceDatabase({
  outcome,
  dumps,
  busy,
  pendingImports,
  onShell,
  onDump,
  onImport,
  onDownloadDump,
  onImportFromComputer,
  onReadDumps,
  onRestoreDump,
  onRemoveDump,
}: {
  outcome: DatabaseOutcome | null;
  dumps: DumpsState;
  /** The command in flight, as the protocol names it. */
  busy: string | null;
  /** The dumps still on their way up, imported when they land. */
  pendingImports: readonly PendingImport[];
  onShell: () => Promise<void>;
  onDump: () => Promise<void>;
  onImport: () => Promise<void>;
  /** Answers once the dialog closed and the transfer is queued, or was declined. */
  onDownloadDump: () => Promise<void>;
  onImportFromComputer: () => Promise<void>;
  onReadDumps: () => Promise<void>;
  onRestoreDump: (fileName: string) => Promise<void>;
  onRemoveDump: (fileName: string) => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <>
      <Section name="database" title={t("services.database.title")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            hint={t("services.database.shellHint")}
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
          <Button
            hint={t("transfers.dump.import.help")}
            icon={HardDriveUpload}
            onClick={onImportFromComputer}
            size="sm"
          >
            {t("transfers.dump.import")}
          </Button>
        </div>

        {pendingImports.length > 0 ? (
          <WaitingLine className="text-small">
            {t("transfers.dump.importing")}
            {" · "}
            <span className="font-data">
              {pendingImports.map((one) => one.name).join(", ")}
            </span>
          </WaitingLine>
        ) : null}

        {outcome ? (
          <Panel data-outcome={outcome.kind} inset="sm">
            <Label>{t(TITLES[outcome.kind])}</Label>
            {outcome.lines.length === 0 ? (
              <p className="mt-1 text-ink-3 text-small">
                {t("services.database.empty")}
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {outcome.lines.map((line) => (
                  <li
                    className="break-all font-data text-ink-2 text-small"
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

            {outcome.kind === "dump" && outcome.lines[0] ? (
              <div className="mt-3">
                <Button
                  hint={t("transfers.download.title")}
                  icon={HardDriveDownload}
                  onClick={onDownloadDump}
                  size="sm"
                >
                  {t("transfers.dump.download")}
                </Button>
              </div>
            ) : null}
          </Panel>
        ) : null}
      </Section>

      <Section
        actions={
          <Button
            icon={dumps.status === "idle" ? List : RefreshCw}
            loading={dumps.status === "reading"}
            onClick={onReadDumps}
            size="sm"
          >
            {dumps.status === "idle"
              ? t("services.dumps.read")
              : t("services.dumps.reread")}
          </Button>
        }
        data-dumps={dumps.status}
        name="dumps"
        title={t("services.dumps.title")}
      >
        {dumps.status === "failed" ? (
          <ErrorNotice error={dumps.error} onRetry={onReadDumps} />
        ) : null}

        {dumps.status === "ready" && dumps.dumps.length === 0 ? (
          <p className="text-ink-3 text-small">{t("services.dumps.none")}</p>
        ) : null}

        {dumps.status === "ready" && dumps.dumps.length > 0 ? (
          <Panel as="ul" list>
            {dumps.dumps.map((dump) => (
              <ServiceDumpRow
                busy={busy !== null}
                dump={dump}
                key={dump.name}
                onRemove={() => onRemoveDump(dump.name)}
                onRestore={() => onRestoreDump(dump.name)}
              />
            ))}
          </Panel>
        ) : null}
      </Section>
    </>
  );
}
