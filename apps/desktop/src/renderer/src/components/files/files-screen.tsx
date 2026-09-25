import type { Service } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { remoteEditors } from "@renderer/lib/modules";
import { Screen } from "../ui/screen";
import { FileBrowser } from "./file-browser";

export function FilesScreen({
  serverId,
  serverName,
  services,
  onTerminal,
}: {
  serverId: string;
  serverName: string;
  services: readonly Service[];
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
