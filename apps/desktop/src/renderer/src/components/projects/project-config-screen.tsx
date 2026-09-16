import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { exposureOf } from "@renderer/stores/project-add";
import { useProjectConfig } from "@renderer/stores/project-config";
import { useSnapshot } from "@renderer/stores/snapshot";
import { useEffect } from "react";
import { ProjectConfigPanel } from "./project-config-panel";

/**
 * The configuration tab, bound to its store.
 *
 * The draft opens from the project the snapshot lists and from the other
 * projects of the server, which say which ports and which names are already
 * held. It opens once per project: a snapshot re-read on its timer must not
 * wipe what the reader is typing.
 */
export function ProjectConfigScreen({
  serverId,
  project,
  services,
  host,
}: {
  serverId: string;
  project: Project;
  services: readonly Service[];
  /** The server's address, which a Caddy exposure asks the reader to point their DNS at. */
  host: string | undefined;
}) {
  const state = useSnapshot((s) => s.state);
  const draft = useProjectConfig((s) => s.draft);
  const run = useProjectConfig((s) => s.run);
  const opened = useProjectConfig((s) => s.project?.name ?? null);
  const open = useProjectConfig((s) => s.open);
  const close = useProjectConfig((s) => s.close);
  const save = useProjectConfig((s) => s.save);
  const ready = useProjectConfig((s) => s.ready);
  const restarts = useProjectConfig((s) => s.restarts);
  const dropped = useProjectConfig((s) => s.dropped);
  const processProblem = useProjectConfig((s) => s.processProblem);
  const rowProblems = useProjectConfig((s) => s.rowProblems);
  const setBranch = useProjectConfig((s) => s.setBranch);
  const setBoot = useProjectConfig((s) => s.setBoot);
  const setRuntime = useProjectConfig((s) => s.setRuntime);
  const setProcessId = useProjectConfig((s) => s.setProcessId);
  const setProcessDir = useProjectConfig((s) => s.setProcessDir);
  const setProcessPkgmgr = useProjectConfig((s) => s.setProcessPkgmgr);
  const setProcessCmd = useProjectConfig((s) => s.setProcessCmd);
  const setProcessInstall = useProjectConfig((s) => s.setProcessInstall);
  const addProcess = useProjectConfig((s) => s.addProcess);
  const removeProcess = useProjectConfig((s) => s.removeProcess);
  const setRowLabel = useProjectConfig((s) => s.setRowLabel);
  const setRowPort = useProjectConfig((s) => s.setRowPort);
  const setRowPublish = useProjectConfig((s) => s.setRowPublish);
  const setRowWeb = useProjectConfig((s) => s.setRowWeb);
  const generateRowWeb = useProjectConfig((s) => s.generateRowWeb);
  const addRow = useProjectConfig((s) => s.addRow);
  const removeRow = useProjectConfig((s) => s.removeRow);

  const exposure = exposureOf(services, host);
  const name = project.name;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the draft opens on the project as it was when the tab opened; a snapshot re-read must not reset it under the reader's hands
  useEffect(() => {
    if (opened !== name) {
      open(
        project,
        state.status === "ready" ? state.snapshot.projects : [],
        exposure !== null
      );
    }

    return close;
  }, [name]);

  if (opened !== name) {
    return null;
  }

  return (
    <ProjectConfigPanel
      draft={draft}
      dropped={dropped()}
      edit={{
        addProcess,
        addRow,
        boot: setBoot,
        branch: setBranch,
        generateRowWeb,
        processCmd: setProcessCmd,
        processDir: setProcessDir,
        processId: setProcessId,
        processInstall: setProcessInstall,
        processPkgmgr: setProcessPkgmgr,
        removeProcess,
        removeRow,
        rowLabel: setRowLabel,
        runtime: setRuntime,
        rowPort: setRowPort,
        rowPublish: setRowPublish,
        rowWeb: setRowWeb,
      }}
      exposure={exposure}
      onSave={() => save(serverId)}
      processProblems={draft.processes.map((_process, index) =>
        processProblem(index)
      )}
      project={project}
      ready={ready()}
      restarts={restarts()}
      rowProblems={draft.processes.map((_process, index) => rowProblems(index))}
      run={run}
      services={services}
    />
  );
}
