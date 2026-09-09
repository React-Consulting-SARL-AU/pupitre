import { useTranslations } from "@renderer/i18n/use-translations";
import { useCallback, useEffect, useState } from "react";
import { carriesSecret } from "../../lib/catalog-selection";
import { humanMs } from "../../lib/duration";
import { STEP_COLUMN } from "../../lib/layout";
import { riseAt } from "../../lib/motion";
import { useCatalog } from "../../stores/catalog";
import { useInstall } from "../../stores/install";
import { LiveDuration } from "../ui/live-duration";
import { StepFailure } from "../ui/step-failure";
import { StepHeading } from "../ui/step-heading";
import { InstallLog } from "./install-log";
import { InstallOutcomeBar } from "./install-outcome-bar";
import { InstallProgress } from "./install-progress";
import { InstallReport } from "./install-report";
import { InstallSending } from "./install-sending";

/**
 * The installation, watched from start to report.
 *
 * The screen only ever sends module names: the configuration goes with them,
 * and what the reader typed as a secret stays in the main process until the
 * install writes it on the protocol's secret line. Nothing on this screen ever
 * held it.
 *
 * A module that fails is retried where it stands, in the same list; a request
 * the agent refused before touching anything is asked again whole; a report
 * left behind by a link that dropped is read back rather than replayed.
 */
export function InstallScreen({
  serverId,
  serverName,
  modules: wanted,
  onContinue,
  onReplay,
}: {
  serverId: string;
  serverName?: string;
  /**
   * What to install, when it is not simply the catalogue selection: a resumed
   * onboarding installs what the machine is still missing, not what it already
   * runs.
   */
  modules?: readonly string[];
  onContinue?: () => void;
  /**
   * What a replay means outside this screen. A module that carried a secret
   * cannot simply run again, and the flow above says what to do about it.
   */
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

  const catalog = useCatalog((state) => state.modules);
  const selected = useCatalog((state) => state.selected);
  const config = useCatalog((state) => state.config);
  const settled = useCatalog((state) => state.settled);
  const deferred = useCatalog((state) => state.deferred);

  const [replaying, setReplaying] = useState<string | null>(null);

  const asked = wanted ?? selected;

  /**
   * The generated secrets are made in the main process, one round trip each:
   * starting before they have landed would install a database with no password
   * on it.
   */
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

  useEffect(() => {
    // Nothing chosen is not an install to run: an app that comes back before
    // the catalogue has answered would otherwise ask the agent for nothing and
    // be told so, on a screen that has nothing to do with it.
    if (useInstall.getState().install.status !== "idle" || asked.length === 0) {
      return;
    }

    run();
  }, [asked, run]);

  function manifestOf(moduleId: string) {
    return catalog().find((manifest) => manifest.id === moduleId);
  }

  function nameOf(moduleId: string): string {
    return manifestOf(moduleId)?.name ?? moduleId;
  }

  function blockingOf(failed: readonly string[]): string[] {
    return failed.filter((id) => manifestOf(id)?.mandatory);
  }

  /** Every failed module can run again as it is: none of them carried a secret. */
  function plainFailures(failed: readonly string[]): boolean {
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
    ) : (
      t("install.streaming")
    );

  return (
    <section className="flex flex-1 flex-col">
      <div className={`${STEP_COLUMN} flex flex-1 flex-col gap-section pb-6`}>
        <StepHeading
          description={description}
          eyebrow={t("install.eyebrow")}
          step="install"
          title={serverName ?? t("install.thisServer")}
        />

        {install.status === "sending" ? (
          <InstallSending arch={install.arch} />
        ) : null}

        {install.status === "failed" ? (
          /*
          A run that never reached a module left no report to read: what it
          refused, it refused before touching the machine, so the way out is to
          ask again rather than to read what was done. A run that did touch it
          has a report, and that is what a link that dropped left behind.
        */
          <StepFailure
            error={install.error}
            onRetry={
              touched() || asked.length === 0 ? () => reload(serverId) : run
            }
            retryLabel={
              touched() || asked.length === 0
                ? t("install.rereadReport")
                : t("install.retry")
            }
          />
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
      </div>

      {install.status === "done" ? (
        <InstallOutcomeBar
          blocking={blockingOf(install.result.failed)}
          nameOf={nameOf}
          onContinue={onContinue}
          onReplayAll={
            plainFailures(install.result.failed) ? replayAll : undefined
          }
          replaying={replaying}
          result={install.result}
        />
      ) : null}
    </section>
  );
}
