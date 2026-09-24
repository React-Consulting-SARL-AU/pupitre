import type { Manifest } from "@pupitre/shared/catalog";
import type { ContentsState } from "@renderer/stores/backups";
import type { AgentError } from "@shared/agent";
import type { ReactNode } from "react";
import { BackupsDestination } from "./backups-destination";
import { BackupsSettings } from "./backups-settings";
import type { BackupsTab } from "./backups-tabs";

/** The pane the open tab names; the settings wait for the module's manifest. */
export function BackupsPane({
  tab,
  serverId,
  manifest,
  contents,
  overview,
  nameOf,
  onRetryContents,
  onReset,
}: {
  tab: BackupsTab;
  serverId: string;
  manifest: Manifest | null;
  contents: ContentsState;
  overview: ReactNode;
  nameOf: (moduleId: string) => string;
  onRetryContents: () => Promise<void>;
  onReset: (forgetConnection: boolean) => Promise<AgentError | null>;
}) {
  if (tab === "overview") {
    return overview;
  }

  if (!manifest) {
    return null;
  }

  return tab === "destination" ? (
    <BackupsDestination
      manifest={manifest}
      nameOf={nameOf}
      onReset={onReset}
      serverId={serverId}
    />
  ) : (
    <BackupsSettings
      contents={contents}
      manifest={manifest}
      nameOf={nameOf}
      onRetryContents={onRetryContents}
      pane={tab}
      serverId={serverId}
    />
  );
}
