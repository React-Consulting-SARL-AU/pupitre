import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server } from "@shared/servers";
import { Button } from "../ui/button";
import { CopyField } from "../ui/copy-field";
import { Panel } from "../ui/panel";

/** Only the public half: the private key never appears in the interface. */
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
  doneLabel?: string;
}) {
  const t = useTranslations();

  return (
    <Panel className="fade-in" inset="lg">
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
    </Panel>
  );
}
