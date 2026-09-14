import type { Service } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { remoteEditors } from "@renderer/lib/modules";
import { Screen } from "../ui/screen";
import { FileBrowser } from "./file-browser";

/**
 * The files of the server, from the root the agent holds.
 *
 * Nothing above that root exists for the app: the agent opens it once and
 * acts only through it. The projects live under it, and so does everything
 * else the account keeps.
 */
export function FilesScreen({
  serverId,
  serverName,
  services,
  onTerminal,
}: {
  serverId: string;
  serverName: string;
  services: readonly Service[];
  /** A shell in a folder of the server, relative to its root. */
  onTerminal: (dir: string) => void;
}) {
  const t = useTranslations();

  return (
    <Screen eyebrow={serverName} fill title={t("files.screen.title")}>
      <FileBrowser
        editors={remoteEditors(services)}
        onTerminal={onTerminal}
        root={null}
        rootLabel={t("files.root.server")}
        serverId={serverId}
      />
    </Screen>
  );
}
