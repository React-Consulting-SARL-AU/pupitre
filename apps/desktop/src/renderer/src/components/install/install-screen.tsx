import { useTranslations } from "@renderer/i18n/use-translations";
import { type ReactNode, useCallback, useState } from "react";
import { carriesSecret } from "../../lib/catalog-selection";
import { humanMs } from "../../lib/duration";
import { riseAt } from "../../lib/motion";
import { useCatalog } from "../../stores/catalog";
import { useInstall } from "../../stores/install";
import { Callout } from "../ui/callout";
import { LiveDuration } from "../ui/live-duration";
import { Screen } from "../ui/screen";
import { StepFailure } from "../ui/step-failure";
import { InstallLog } from "./install-log";
import { InstallOutcomeBar } from "./install-outcome-bar";
import { InstallProgress } from "./install-progress";
import { InstallReport } from "./install-report";
import { InstallSending } from "./install-sending";

export function InstallScreen({
  serverId,
  serverName,
  modules: wanted,
  actions,
  plain,
  onContinue,
  onReplay,
}: {
  serverId: string;
  serverName?: string;
  actions?: ReactNode;
  plain?: boolean;
  /** Overrides the catalogue selection: a resumed onboarding installs only what the machine still lacks. */
  modules?: readonly string[];
  onContinue?: () => void;
  /** A module that carried a secret cannot simply run again, so the caller decides what a replay means. */
  onReplay?: (moduleId: string) => Promise<void>;
}) {
  const t = useTranslations();

  const install = useInstall((state) => state.install);
  const modules = useInstall((state) => state.modules);
  const log = useInstall((state) => state.log);
  const counts = useInstall((state) => state.counts);
  const elapsed = useInstall((state) => state.elapsed);
  const start = useInstall((state) => state.start);
  const replay = useInstall((state) => state.replay);
  const replayFailed = useInstall((state) => state.replayFailed);
  const reload = useInstall((state) => state.reload);
  const touched = useInstall((state) => state.touched);
  const secretsDropped = useInstall((state) => state.secretsDropped);

  const catalog = useCatalog((state) => state.modules);
  const selected = useCatalog((state) => state.selected);
  const config = useCatalog((state) => state.config);
  const settled = useCatalog((state) => state.settled);
  const deferred = useCatalog((state) => state.deferred);

  const [replaying, setReplaying] = useState<string | null>(null);

  const asked = wanted ?? selected;
  const rereadsReport = touched() || asked.length === 0;

  // Generated secrets are made in main, one round trip each: nothing starts before they land.
  const run = useCallback(
    () =>
      settled().then(() =>
        start(
          serverId,
          asked,
          config(),
          deferred.filter((one) => asked.includes(one))
        )
      ),
    [asked, config, deferred, serverId, settled, start]
  );

  function manifestOf(moduleId: string) {
    return catalog().find((manifest) => manifest.id === moduleId);
  }

  function nameOf(moduleId: string): string {
    return manifestOf(moduleId)?.name ?? moduleId;
  }

  function blockingOf(failed: readonly string[]): string[] {
    return failed.filter((id) => manifestOf(id)?.mandatory);
  }

  function noneCarriedSecret(failed: readonly string[]): boolean {
    return failed.every((id) => {
      const manifest = manifestOf(id);

      return manifest ? !carriesSecret(manifest) : true;
    });
  }

  async function replayOne(moduleId: string): Promise<void> {
    setReplaying(moduleId);
    await (onReplay ? onReplay(moduleId) : replay(serverId, moduleId));
    setReplaying(null);
  }

  async function replayAll(): Promise<void> {
    setReplaying("*");
    await replayFailed(serverId);
    setReplaying(null);
  }

  const { done, total } = counts();
  const spent = elapsed();
  const working = install.status === "sending" || install.status === "running";

  const description =
    total > 0 ? (
      <>
        {t.plural("install.progress", done, { total })}
        {working ? (
          <>
            {" · "}
            <LiveDuration className="tabular-nums" />
          </>
        ) : null}
        {!working && spent > 0 ? ` · ${humanMs(spent)}` : null}
      </>
    ) : undefined;

  return (
    <Screen
      actions={actions}
      column
      description={description}
      eyebrow={serverName ?? t("install.thisServer")}
      footer={
        install.status === "done" ? (
          <InstallOutcomeBar
            blocking={blockingOf(install.result.failed)}
            nameOf={nameOf}
            onContinue={onContinue}
            onReplayAll={
              noneCarriedSecret(install.result.failed) ? replayAll : undefined
            }
            replaying={replaying}
            result={install.result}
          />
        ) : null
      }
      plain={plain}
      step="install"
      title={t("install.title")}
    >
      {install.status === "sending" ? <InstallSending /> : null}

      {install.status === "failed" ? (
        <StepFailure
          error={install.error}
          onRetry={rereadsReport ? () => reload(serverId) : run}
          retryLabel={
            rereadsReport ? t("install.rereadReport") : t("install.retry")
          }
        />
      ) : null}

      {install.status === "failed" && secretsDropped ? (
        <Callout name="secrets-dropped" tone="warn">
          {t("install.secretsDropped")}
        </Callout>
      ) : null}

      {modules.length > 0 ? (
        <div className="rise" style={riseAt(0)}>
          <InstallProgress modules={modules} nameOf={nameOf} />
        </div>
      ) : null}

      <div className="rise" style={riseAt(1)}>
        <InstallLog lines={log} />
      </div>

      {install.status === "done" ? (
        <div className="rise" style={riseAt(2)}>
          <InstallReport
            modules={modules}
            nameOf={nameOf}
            onReplay={replayOne}
            replaying={replaying}
            result={install.result}
          />
        </div>
      ) : null}
    </Screen>
  );
}
