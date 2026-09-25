import { useEffect } from "react";
import {
  type Exposure,
  GITHUB_TOOL,
  useProjectAdd,
} from "../../stores/project-add";
import { snapshotOf, useSnapshot } from "../../stores/snapshot";
import { ProjectAddPanel } from "./project-add-panel";

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
  exposure: Exposure | null;
  services: readonly string[];
  onCancel?: () => void;
  onFinish?: (name: string) => void;
  onConnect: () => void;
  onInstallModule: () => void;
}) {
  const known = useProjectAdd((state) => state.known);
  const draft = useProjectAdd((state) => state.draft);
  const declared = useProjectAdd((state) => state.declared);
  const detection = useProjectAdd((state) => state.detection);
  const step = useProjectAdd((state) => state.step);
  const skipReading = useProjectAdd((state) => state.skipReading);
  const editSource = useProjectAdd((state) => state.editSource);
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
  const setStartNow = useProjectAdd((state) => state.setStartNow);
  const setBoot = useProjectAdd((state) => state.setBoot);
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

  // Follow the machine: a server still binding its port at start is online on the next read.
  const liveState = useSnapshot((state) =>
    run.status === "done"
      ? snapshotOf(state.state, serverId)?.projects.find(
          (project) => project.name === run.name
        )?.state
      : undefined
  );

  // Depend on these two values, not the object: each snapshot re-read hands a new one.
  const provider = exposure?.provider ?? null;
  const host = exposure?.host ?? "";

  // Unmounting parks the draft so a detour to the settings keeps it; only cancel or finish resets it.
  useEffect(() => {
    prepare(serverId, provider ? { host, provider } : null);

    return park;
  }, [serverId, provider, host, prepare, park]);

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
      declared={declared()}
      detection={detection}
      draft={draft}
      edit={{
        addProcess,
        addRow,
        boot: setBoot,
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
        startNow: setStartNow,
      }}
      exposure={exposure}
      folders={folders}
      githubModule={services.includes(GITHUB_TOOL)}
      known={known}
      logs={logs}
      onCancel={onCancel ? () => leave(onCancel) : undefined}
      onConnect={onConnect}
      onDetect={() => detect(serverId)}
      onEdit={park}
      onEditSource={editSource}
      onFinish={() => {
        if (run.status === "done") {
          const { name } = run;

          leave(() => onFinish?.(name));
        }
      }}
      onInstallModule={onInstallModule}
      onLaunch={() => launch(serverId)}
      onOpen={(url) => window.pupitre.openUrl(url)}
      onOpenDeclared={(name) => leave(() => onFinish?.(name))}
      onReload={() => prepare(serverId, exposure)}
      onRetry={() => retry(serverId)}
      onSkipReading={skipReading}
      phases={phases}
      processProblems={draft.processes.map((_process, index) =>
        processProblem(index)
      )}
      ready={ready()}
      repos={repos}
      rowProblems={draft.processes.map((_process, index) => rowProblems(index))}
      run={run}
      state={liveState}
      step={step}
    />
  );
}
