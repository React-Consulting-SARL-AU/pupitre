import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { WindowBand } from "@renderer/components/ui/window-band";
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
 * either it has no agent — the onboarding is what puts one there — or the link
 * itself is refusing. The screen does not decide which: it shows the agent's
 * own message and its remedy, and offers the two ways out. A machine that has
 * never been declared is not this screen's business: nothing has failed there,
 * and `FirstRunScreen` says what comes next instead.
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

  return (
    <div className="relative grid h-full place-items-center px-8">
      <WindowBand className="absolute inset-x-0 top-0" />

      <div
        className="clickable w-full max-w-xl"
        data-unready={error ? "refused" : "reaching"}
      >
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <Label>{t("shell.unready.eyebrow")}</Label>
        </div>

        <h1 className="mt-3 font-bold font-display text-2xl text-ink tracking-tight">
          {error
            ? t("shell.unready.notRespondingTitle", { name: server.name })
            : t("shell.unready.reachingTitle", { name: server.name })}
        </h1>

        <p className="mt-2 text-ink-3 leading-relaxed">
          {error
            ? t("shell.unready.notRespondingBody")
            : t("shell.unready.reachingBody")}
        </p>

        {error ? (
          <div className="mt-6">
            <ErrorNotice error={error} />
          </div>
        ) : (
          <WaitingLine className="mt-6 font-data text-[12px]">
            {server.user}@{server.host}:{server.port}
          </WaitingLine>
        )}

        {error ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button icon={Wrench} onClick={onInstall} variant="inverse">
              {t("shell.unready.installAgent")}
            </Button>
            <Button icon={RotateCw} onClick={onRetry}>
              {t("common.retry")}
            </Button>
            <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
              {t("shell.unready.manageServers")}
            </Button>
          </div>
        ) : (
          <div className="mt-6">
            <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
              {t("shell.unready.manageServers")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
