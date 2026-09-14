import { useEffect } from "react";
import {
  type Exposure,
  GITHUB_TOOL,
  useProjectAdd,
} from "../../stores/project-add";
import { ProjectAddPanel } from "./project-add-panel";

/**
 * The new-project screen, bound to its store.
 *
 * The reading of the declared projects starts on its own: their ports decide
 * which one this project may take, and asking for that is not a decision the
 * reader should have to make. Leaving for the settings or for the services
 * parks the draft rather than dropping it — the reader who goes to connect a
 * GitHub account comes back to the form they had filled in — and only cancelling
 * or finishing empties it.
 */
export function ProjectAddScreen({
  serverId,
  exposure,
  services,
  onCancel,
  onFinish,
  onConnect,
  onInstallModule,
}: {
  serverId: string;
  /** What publishes a port on this server, or nothing: what is chosen is whether to publish each one. */
  exposure: Exposure | null;
  /** What the snapshot reports on this machine, which says what a private clone would cost. */
  services: readonly string[];
  onCancel?: () => void;
  onFinish?: (name: string) => void;
  onConnect: () => void;
  onInstallModule: () => void;
}) {
  const known = useProjectAdd((state) => state.known);
  const draft = useProjectAdd((state) => state.draft);
  const detected = useProjectAdd((state) => state.detected);
  const detection = useProjectAdd((state) => state.detection);
  const repos = useProjectAdd((state) => state.repos);
  const folders = useProjectAdd((state) => state.folders);
  const phases = useProjectAdd((state) => state.phases);
  const logs = useProjectAdd((state) => state.logs);
  const run = useProjectAdd((state) => state.run);
  const prepare = useProjectAdd((state) => state.prepare);
  const detect = useProjectAdd((state) => state.detect);
  const launch = useProjectAdd((state) => state.launch);
  const retry = useProjectAdd((state) => state.retry);
  const park = useProjectAdd((state) => state.park);
  const reset = useProjectAdd((state) => state.reset);
  const ready = useProjectAdd((state) => state.ready);
  const processProblem = useProjectAdd((state) => state.processProblem);
  const rowProblems = useProjectAdd((state) => state.rowProblems);
  const setKind = useProjectAdd((state) => state.setKind);
  const setSource = useProjectAdd((state) => state.setSource);
  const setName = useProjectAdd((state) => state.setName);
  const setBranch = useProjectAdd((state) => state.setBranch);
  const setProcessId = useProjectAdd((state) => state.setProcessId);
  const setProcessDir = useProjectAdd((state) => state.setProcessDir);
  const setProcessPkgmgr = useProjectAdd((state) => state.setProcessPkgmgr);
  const setProcessCmd = useProjectAdd((state) => state.setProcessCmd);
  const setProcessInstall = useProjectAdd((state) => state.setProcessInstall);
  const addProcess = useProjectAdd((state) => state.addProcess);
  const removeProcess = useProjectAdd((state) => state.removeProcess);
  const setRowLabel = useProjectAdd((state) => state.setRowLabel);
  const setRowPort = useProjectAdd((state) => state.setRowPort);
  const setRowPublish = useProjectAdd((state) => state.setRowPublish);
  const setRowWeb = useProjectAdd((state) => state.setRowWeb);
  const generateRowWeb = useProjectAdd((state) => state.generateRowWeb);
  const addRow = useProjectAdd((state) => state.addRow);
  const removeRow = useProjectAdd((state) => state.removeRow);
  const loadRepos = useProjectAdd((state) => state.loadRepos);
  const pickRepo = useProjectAdd((state) => state.pickRepo);
  const browse = useProjectAdd((state) => state.browse);
  const makeFolder = useProjectAdd((state) => state.makeFolder);
  const pickFolder = useProjectAdd((state) => state.pickFolder);

  const provider = exposure?.provider ?? null;
  const host = exposure?.host ?? "";

  // The exposure is rebuilt from its two values so that a snapshot re-read on
  // its timer, which hands a new object each time, does not restart the screen.
  useEffect(() => {
    prepare(serverId, provider ? { host, provider } : null);

    return park;
  }, [serverId, provider, host, prepare, park]);

  // The list and the first folder are read when their way in is chosen, and
  // once: what they cost is one call, and what they save is a screen that is
  // already filled when the reader looks at it.
  useEffect(() => {
    if (draft.kind === "github" && repos.status === "idle") {
      loadRepos();
    }

    if (draft.kind === "dir" && folders.status === "idle") {
      browse(serverId, "");
    }
  }, [draft.kind, repos.status, folders.status, loadRepos, browse, serverId]);

  function leave(after: () => void) {
    reset();
    after();
  }

  return (
    <ProjectAddPanel
      detected={detected}
      detection={detection}
      draft={draft}
      edit={{
        addProcess,
        addRow,
        branch: setBranch,
        browse: (path) => browse(serverId, path),
        createFolder: (name) => makeFolder(serverId, name),
        generateRowWeb,
        kind: setKind,
        loadRepos,
        name: setName,
        pickFolder,
        pickRepo,
        processCmd: setProcessCmd,
        processDir: setProcessDir,
        processId: setProcessId,
        processInstall: setProcessInstall,
        processPkgmgr: setProcessPkgmgr,
        removeProcess,
        removeRow,
        rowLabel: setRowLabel,
        rowPort: setRowPort,
        rowPublish: setRowPublish,
        rowWeb: setRowWeb,
        source: setSource,
      }}
      exposure={exposure}
      folders={folders}
      githubModule={services.includes(GITHUB_TOOL)}
      known={known}
      logs={logs}
      onCancel={onCancel ? () => leave(onCancel) : undefined}
      onConnect={onConnect}
      onDetect={() => detect(serverId)}
      onFinish={() => {
        if (run.status === "done") {
          const { name } = run;

          leave(() => onFinish?.(name));
        }
      }}
      onInstallModule={onInstallModule}
      onLaunch={() => launch(serverId)}
      onOpen={(url) => window.pupitre.openUrl(url)}
      onReload={() => prepare(serverId, exposure)}
      onRetry={() => retry(serverId)}
      phases={phases}
      processProblems={draft.processes.map((_process, index) =>
        processProblem(index)
      )}
      ready={ready()}
      repos={repos}
      rowProblems={draft.processes.map((_process, index) => rowProblems(index))}
      run={run}
    />
  );
}
