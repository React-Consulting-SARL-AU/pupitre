import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server } from "@shared/servers";
import { Button } from "../ui/button";
import { CopyField } from "../ui/copy-field";

/**
 * What is left to do on the server, and it is one line.
 *
 * The private half never appears here nor anywhere else in the interface: what
 * the user carries to their machine is the public half, and the command that
 * installs it.
 */
export function ServerKeyCard({
  server,
  publicKey,
  copyId,
  onDone,
  doneLabel,
}: {
  server: Server;
  publicKey: string;
  copyId: string | null;
  onDone: () => void;
  /** What the way on is called when there is a next step to go to. */
  doneLabel?: string;
}) {
  const t = useTranslations();

  return (
    <div className="elevation-raised fade-in rounded-md border border-line bg-surface p-5">
      <h3 className="font-medium text-ink">
        {t("servers.key.title", { name: server.name })}
      </h3>
      <p className="mt-1 text-ink-3 leading-relaxed">
        {t("servers.key.intro")}
      </p>

      <div className="mt-5 flex flex-col gap-5">
        <CopyField
          help={t("servers.key.publicHelp")}
          label={t("servers.field.publicKey")}
          value={publicKey}
        />

        {copyId ? (
          <CopyField
            help={t("servers.key.commandHelp")}
            label={t("servers.key.commandLabel")}
            value={copyId}
          />
        ) : null}
      </div>

      <div className="mt-5">
        <Button onClick={onDone} variant="inverse">
          {doneLabel ?? t("servers.key.done")}
        </Button>
      </div>
    </div>
  );
}
