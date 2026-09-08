import type { AgentError } from "@shared/agent";
import type { Server } from "@shared/servers";
import { FirstRunScreen } from "./first-run-screen";
import { ServerUnreadyScreen } from "./server-unready-screen";

/**
 * The app with no machine to drive, in its two very different cases.
 *
 * Nothing declared yet is not a failure: it is a first launch, and it gets the
 * screen that says what comes next. A machine that is declared and silent is a
 * failure, and gets the one that says what the connection returned.
 */
export function NoServerScreen({
  server,
  error,
  onInstall,
  onAddServer,
  onRetry,
  onSettings,
}: {
  server: Server | null;
  error: AgentError | null;
  onInstall: () => void;
  onAddServer: () => void;
  onRetry: () => void;
  onSettings: () => void;
}) {
  if (!server) {
    return <FirstRunScreen onAddServer={onAddServer} onSettings={onSettings} />;
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
