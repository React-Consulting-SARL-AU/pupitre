import { useEffect } from "react";
import { useFirstProject } from "../../stores/first-project";
import { FirstProjectPanel } from "./first-project-panel";

/**
 * The first-project step, bound to its store.
 *
 * The reading of the declared projects starts on its own: their ports decide
 * which one this project may take, and asking for that is not a decision the
 * reader should have to make.
 */
export function FirstProjectScreen({
  serverId,
  serverName,
  cloudflare,
  onSkip,
  onFinish,
}: {
  serverId: string;
  serverName?: string;
  cloudflare: boolean;
  onSkip?: () => void;
  onFinish?: () => void;
}) {
  const known = useFirstProject((state) => state.known);
  const draft = useFirstProject((state) => state.draft);
  const detected = useFirstProject((state) => state.detected);
  const phases = useFirstProject((state) => state.phases);
  const logs = useFirstProject((state) => state.logs);
  const run = useFirstProject((state) => state.run);
  const prepare = useFirstProject((state) => state.prepare);
  const launch = useFirstProject((state) => state.launch);
  const retry = useFirstProject((state) => state.retry);
  const ready = useFirstProject((state) => state.ready);
  const setSource = useFirstProject((state) => state.setSource);
  const setName = useFirstProject((state) => state.setName);
  const setPkgmgr = useFirstProject((state) => state.setPkgmgr);
  const setPort = useFirstProject((state) => state.setPort);
  const setSubdomain = useFirstProject((state) => state.setSubdomain);
  const setCmd = useFirstProject((state) => state.setCmd);

  useEffect(() => {
    if (useFirstProject.getState().known.status === "idle") {
      prepare(serverId, cloudflare);
    }
  }, [serverId, cloudflare, prepare]);

  return (
    <FirstProjectPanel
      cloudflare={cloudflare}
      detected={detected}
      draft={draft}
      edit={{
        cmd: setCmd,
        name: setName,
        pkgmgr: setPkgmgr,
        port: setPort,
        source: setSource,
        subdomain: setSubdomain,
      }}
      known={known}
      logs={logs}
      onFinish={onFinish}
      onLaunch={() => launch(serverId)}
      onOpen={(url) => window.pupitre.openUrl(url)}
      onReload={() => prepare(serverId, cloudflare)}
      onRetry={() => retry(serverId)}
      onSkip={onSkip}
      phases={phases}
      ready={ready()}
      run={run}
      serverName={serverName}
    />
  );
}
