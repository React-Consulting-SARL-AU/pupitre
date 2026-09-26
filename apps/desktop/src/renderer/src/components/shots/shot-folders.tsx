import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { Tab, TabBar } from "@renderer/components/ui/tab-bar";
import { useTranslations } from "@renderer/i18n/use-translations";
import { folderLabel } from "@renderer/lib/shot-folder";
import { ALL_SHOTS, shotFolders } from "@renderer/stores/shots";

export function ShotFolders({
  shots,
  folder,
  onChoose,
}: {
  shots: readonly Shot[];
  folder: string;
  onChoose: (folder: string) => void;
}) {
  const t = useTranslations();

  const folders = [
    { count: shots.length, folder: ALL_SHOTS },
    ...shotFolders(shots),
  ];

  return (
    <TabBar label={t("shots.folders")} onChange={onChoose} value={folder}>
      {folders.map((each) => (
        <Tab key={each.folder} value={each.folder}>
          <span data-shot-folder={each.folder}>
            {folderLabel(t, each.folder)}
          </span>
          <span className="font-data text-caption text-ink-4 tabular-nums">
            {each.count}
          </span>
        </Tab>
      ))}
    </TabBar>
  );
}
