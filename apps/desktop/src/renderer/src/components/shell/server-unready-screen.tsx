import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { WindowBand } from "@renderer/components/ui/window-band";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { Server } from "@shared/servers";
import { RotateCw, Settings as SettingsIcon, Wrench } from "lucide-react";

/**
 * A server the app can name but not drive.
 *
 * Either it has no agent yet — the onboarding is what puts one there — or the
 * link itself is refusing. The screen does not decide which: it shows the
 * agent's own message and its remedy, and offers the two ways out. A machine
 * that has never been declared is not this screen's business: nothing has
 * failed there, and `FirstRunScreen` says what comes next instead.
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
  onRetry: () => void;
  onSettings: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="relative grid h-full place-items-center px-8">
      <WindowBand className="absolute inset-x-0 top-0" />

      <div className="clickable w-full max-w-xl">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <Label>{t("shell.unready.eyebrow")}</Label>
        </div>

        <h1 className="mt-3 font-bold font-display text-2xl text-ink tracking-tight">
          {t("shell.unready.notRespondingTitle", { name: server.name })}
        </h1>

        <p className="mt-2 text-ink-3 leading-relaxed">
          {t("shell.unready.notRespondingBody")}
        </p>

        {error ? (
          <div className="elevation-raised mt-6 rounded-md border border-line bg-surface px-4 py-3">
            <p className="font-data text-[12px] text-ink-4">{error.code}</p>
            <p className="mt-1 text-ink">{agentText(t, error).message}</p>
            {error.fix ? (
              <code className="mt-2 block font-data text-[12px] text-ink-2">
                {agentText(t, error).fix}
              </code>
            ) : null}
          </div>
        ) : null}

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
      </div>
    </div>
  );
}
