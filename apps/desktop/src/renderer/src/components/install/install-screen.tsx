import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { humanMs } from "../../lib/duration";
import { riseAt } from "../../lib/motion";
import { useCatalog } from "../../stores/catalog";
import { useInstall } from "../../stores/install";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { InstallLog } from "./install-log";
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
  const reload = useInstall((state) => state.reload);
  const touched = useInstall((state) => state.touched);

  const catalog = useCatalog((state) => state.modules);
  const selected = useCatalog((state) => state.selected);
  const config = useCatalog((state) => state.config);
  const settled = useCatalog((state) => state.settled);

  const [replaying, setReplaying] = useState<string | null>(null);

  const asked = wanted ?? selected;

  /**
   * The generated secrets are made in the main process, one round trip each:
   * starting before they have landed would install a database with no password
   * on it.
   */
  const run = useCallback(
    () => settled().then(() => start(serverId, asked, config())),
    [asked, config, serverId, settled, start]
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

  function nameOf(moduleId: string): string {
    return (
      catalog().find((manifest) => manifest.id === moduleId)?.name ?? moduleId
    );
  }

  function blockingOf(failed: readonly string[]): string[] {
    const mandatory = catalog()
      .filter((manifest) => manifest.mandatory)
      .map((manifest) => manifest.id);

    return failed.filter((id) => mandatory.includes(id));
  }

  async function replayOne(moduleId: string): Promise<void> {
    setReplaying(moduleId);
    await (onReplay ? onReplay(moduleId) : replay(serverId, moduleId));
    setReplaying(null);
  }

  const { done, total } = counts();
  const spent = elapsed();

  const header = (
    <PageHeader
      description={
        total > 0
          ? `${t.plural("install.progress", done, { total })}${spent > 0 ? ` · ${humanMs(spent)}` : ""}`
          : t("install.streaming")
      }
      eyebrow={t("install.eyebrow")}
      title={serverName ?? t("install.thisServer")}
    />
  );

  return (
    <section className="flex flex-col gap-section">
      {header}

      {install.status === "sending" ? (
        <InstallSending arch={install.arch} />
      ) : null}

      {install.status === "failed" ? (
        <Callout
          action={
            /*
              A run that never reached a module left no report to read: what it
              refused, it refused before touching the machine, so the way out is
              to ask again rather than to read what was done. Nothing to ask
              again for — a resumed screen that found the machine already done —
              and the report is all there is.
            */
            touched() || asked.length === 0 ? (
              <Button icon={RefreshCw} onClick={() => reload(serverId)}>
                {t("install.rereadReport")}
              </Button>
            ) : (
              <Button icon={RefreshCw} onClick={run}>
                {t("install.retry")}
              </Button>
            )
          }
          fix={agentText(t, install.error).fix}
          tone="danger"
        >
          {agentText(t, install.error).message}
        </Callout>
      ) : null}

      {modules.length > 0 ? (
        <div className="rise" style={riseAt(0)}>
          <InstallProgress modules={modules} nameOf={nameOf} />
        </div>
      ) : null}

      {install.status === "done" ? (
        <div className="rise" style={riseAt(1)}>
          <InstallReport
            blocking={blockingOf(install.result.failed)}
            modules={modules}
            nameOf={nameOf}
            onContinue={onContinue}
            onReplay={replayOne}
            replaying={replaying}
            result={install.result}
          />
        </div>
      ) : null}

      <div className="rise" style={riseAt(2)}>
        <InstallLog lines={log} />
      </div>
    </section>
  );
}
