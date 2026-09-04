import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { humanMs } from "../../lib/duration";
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
  onContinue,
  onReplay,
}: {
  serverId: string;
  serverName?: string;
  onContinue?: () => void;
  /**
   * What a replay means outside this screen. A module that carried a secret
   * cannot simply run again, and the flow above says what to do about it.
   */
  onReplay?: (moduleId: string) => Promise<void>;
}) {
  const install = useInstall((state) => state.install);
  const modules = useInstall((state) => state.modules);
  const log = useInstall((state) => state.log);
  const counts = useInstall((state) => state.counts);
  const elapsed = useInstall((state) => state.elapsed);
  const start = useInstall((state) => state.start);
  const replay = useInstall((state) => state.replay);
  const reload = useInstall((state) => state.reload);

  const catalog = useCatalog((state) => state.modules);
  const selected = useCatalog((state) => state.selected);
  const config = useCatalog((state) => state.config);
  const settled = useCatalog((state) => state.settled);

  const [replaying, setReplaying] = useState<string | null>(null);

  useEffect(() => {
    if (useInstall.getState().install.status !== "idle") {
      return;
    }

    // The generated secrets are made in the main process, one round trip each:
    // starting before they have landed would install a database with no
    // password on it.
    settled().then(() => start(serverId, selected, config()));
  }, [serverId, selected, config, settled, start]);

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
          ? `${done} module${done > 1 ? "s" : ""} sur ${total}${spent > 0 ? ` · ${humanMs(spent)}` : ""}`
          : "Les étapes arrivent de l'agent, au fur et à mesure."
      }
      eyebrow="Installation"
      title={serverName ?? "Ce serveur"}
    />
  );

  return (
    <section className="flex flex-col gap-8">
      {header}

      {install.status === "sending" ? (
        <InstallSending arch={install.arch} />
      ) : null}

      {install.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => reload(serverId)}>
              Relire le rapport
            </Button>
          }
          fix={install.error.fix}
          tone="danger"
        >
          {install.error.message}
        </Callout>
      ) : null}

      {modules.length > 0 ? (
        <InstallProgress modules={modules} nameOf={nameOf} />
      ) : null}

      {install.status === "done" ? (
        <InstallReport
          blocking={blockingOf(install.result.failed)}
          modules={modules}
          nameOf={nameOf}
          onContinue={onContinue}
          onReplay={replayOne}
          replaying={replaying}
          result={install.result}
        />
      ) : null}

      <InstallLog lines={log} />
    </section>
  );
}
