import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { GateScreen } from "@renderer/components/ui/gate-screen";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import type { AgentError } from "@shared/agent";
import type { Server } from "@shared/servers";
import { RotateCw, Settings as SettingsIcon, Wrench } from "lucide-react";

/**
 * A server the app can name but not drive.
 *
 * While the first read is in flight the screen says so, and nothing more: a
 * machine that has not answered yet is not a machine that refuses. Once it has,
 * either the link is refusing for a while — trying again is the first answer —
 * or it has no agent, and the onboarding is what puts one there. The screen
 * does not decide which: it shows the agent's own message and its remedy, and
 * offers the ways out. A machine that has never been declared is not this
 * screen's business: nothing has failed there, and `FirstRunScreen` says what
 * comes next instead.
 */
export function ServerUnreadyScreen({
  server,
  error,
  onInstall,
  onRetry,
  onSettings,
}: {
  server: Server;
  /** Absent while the first read is still in flight. */
  error: AgentError | null;
  onInstall: () => void;
  onRetry: Gesture;
  onSettings: () => void;
}) {
  const t = useTranslations();

  const manage = (
    <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
      {t("shell.unready.manageServers")}
    </Button>
  );

  return (
    <GateScreen
      actions={
        error ? (
          <>
            <Button icon={RotateCw} onClick={onRetry} variant="inverse">
              {t("common.retry")}
            </Button>
            <Button icon={Wrench} onClick={onInstall}>
              {t("shell.unready.installAgent")}
            </Button>
            {manage}
          </>
        ) : (
          manage
        )
      }
      data-unready={error ? "refused" : "reaching"}
      eyebrow={t("shell.unready.eyebrow")}
      title={
        error
          ? t("shell.unready.notRespondingTitle", { name: server.name })
          : t("shell.unready.reachingTitle", { name: server.name })
      }
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : (
        <WaitingLine className="font-data text-small">
          {server.user}@{server.host}:{server.port}
        </WaitingLine>
      )}
    </GateScreen>
  );
}
