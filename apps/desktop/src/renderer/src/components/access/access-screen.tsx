import type { Project } from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAccess } from "@renderer/stores/access";
import { useEffect } from "react";
import { Screen } from "../ui/screen";
import { AccessKeys } from "./access-keys";
import { AccessUsage } from "./access-usage";

export function AccessScreen({
  serverId,
  serverName,
  projects,
}: {
  serverId: string;
  serverName: string;
  projects: readonly Project[];
}) {
  const t = useTranslations();

  const read = useAccess((s) => s.read);

  useEffect(() => {
    read(serverId);
  }, [serverId, read]);

  return (
    <Screen eyebrow={serverName} title={t("access.title")}>
      <AccessKeys
        project={null}
        projects={projects}
        serverId={serverId}
        title={t("access.keys.title")}
      />
      <AccessUsage />
    </Screen>
  );
}
