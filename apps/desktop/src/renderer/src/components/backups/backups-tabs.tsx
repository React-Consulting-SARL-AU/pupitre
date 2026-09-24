import { Tab, TabBar } from "@renderer/components/ui/tab-bar";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ReactNode } from "react";

export const BACKUPS_TABS = [
  "overview",
  "frequency",
  "content",
  "destination",
] as const;

export type BackupsTab = (typeof BACKUPS_TABS)[number];

/** The panes of backups in place, in a column as the settings hold theirs, and the one open beside them. */
export function BackupsTabs({
  tab,
  onTab,
  children,
}: {
  tab: BackupsTab;
  onTab: (next: BackupsTab) => void;
  children: ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-start gap-12">
      <TabBar
        label={t("backups.tabs")}
        onChange={onTab}
        orientation="vertical"
        value={tab}
      >
        {BACKUPS_TABS.map((id) => (
          <Tab key={id} orientation="vertical" value={id}>
            {t(`backups.tab.${id}`)}
          </Tab>
        ))}
      </TabBar>

      <div className="flex min-w-0 flex-1 flex-col gap-section" data-pane={tab}>
        {children}
      </div>
    </div>
  );
}
