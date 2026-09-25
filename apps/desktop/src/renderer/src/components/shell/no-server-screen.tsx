import type { AgentError } from "@shared/agent";
import type { Server } from "@shared/servers";
import { FirstRunScreen } from "./first-run-screen";
import { ServerRebootingScreen } from "./server-rebooting-screen";
import { ServerUnreadyScreen } from "./server-unready-screen";

export function NoServerScreen({
  server,
  error,
  rebooting = null,
  onInstall,
  onAddServer,
  onRetry,
  onSettings,
}: {
  server: Server | null;
  error: AgentError | null;
  /** Name of the server whose requested reboot is being waited on. */
  rebooting?: string | null;
  onInstall: () => void;
  onAddServer: () => void;
  onRetry: () => void;
  onSettings: () => void;
}) {
  if (!server) {
    return <FirstRunScreen onAddServer={onAddServer} onSettings={onSettings} />;
  }

  if (rebooting) {
    return (
      <ServerRebootingScreen onSettings={onSettings} serverName={rebooting} />
    );
  }

  return (
    <ServerUnreadyScreen
      error={error}
      onInstall={onInstall}
      onRetry={onRetry}
      onSettings={onSettings}
      server={server}
    />
  );
}
