import { join } from "node:path";
import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import type { AgentResponse } from "@shared/agent";
import type { TransferList } from "@shared/transfers";
import { app, dialog } from "electron";
import { agentClient, currentLanguage } from "./agent";
import { broadcast } from "./broadcast";
import { dialogTextIn } from "./dialogs";
import { handle } from "./ipc";
import { anything, isString, shape } from "./ipc-guard";
import { current } from "./platform";
import { byId, paths } from "./servers";
import { sshArgs } from "./ssh-config";
import { createTransferQueue, type TransferQueue } from "./transfers-run";

// A local path reaches the queue only once the user pointed at it, through a dialog below or a drop.
let queue: TransferQueue | null = null;

function statOn(
  serverId: string,
  path: string,
  hash: boolean
): Promise<AgentResponse<FsStatResult>> {
  return agentClient.request(serverId, "fs.stat", {
    path,
    ...(hash ? { hash } : {}),
  });
}

function held(): TransferQueue {
  if (!queue) {
    throw new Error("transfers registered before the app was ready");
  }

  return queue;
}

export function registerTransfers(deps: {
  root: (serverId: string) => Promise<string | null>;
}): void {
  queue = createTransferQueue({
    platform: current(),
    publish: (list) => broadcast("transfer:changed", list),
    resolve: (serverId) => {
      const server = byId(serverId);

      return server ? sshArgs(server, paths()) : null;
    },
    root: deps.root,
    stat: statOn,
    storePath: join(app.getPath("userData"), "transfers.json"),
  });

  handle("transfer:list", shape(), (): TransferList => held().list());

  handle(
    "transfer:upload",
    shape(anything, anything, anything),
    (_e, serverId, remoteDir, localPaths) =>
      held().upload(serverId, remoteDir, localPaths)
  );

  handle(
    "transfer:download",
    shape(anything, anything, anything),
    (_e, serverId, remotePath, localPath) =>
      held().download(serverId, remotePath, localPath)
  );

  handle("transfer:pause", shape(isString), (_e, id) => held().pause(id));
  handle("transfer:resume", shape(isString), (_e, id) => held().resume(id));
  handle("transfer:cancel", shape(isString), (_e, id) => held().cancel(id));
  handle("transfer:dismiss", shape(isString), (_e, id) => held().dismiss(id));

  handle("transfer:dropped", shape(isString), (_e, path) =>
    held().designate(path)
  );

  handle("transfer:pick-upload", shape(), async (): Promise<string[]> => {
    const picked = await dialog.showOpenDialog({
      buttonLabel: dialogTextIn(currentLanguage(), "send"),
      properties: ["openFile", "openDirectory", "multiSelections"],
      title: dialogTextIn(currentLanguage(), "pickUpload"),
    });

    if (picked.canceled) {
      return [];
    }

    return picked.filePaths.flatMap((path) => {
      const kept = held().designate(path);

      return kept === null ? [] : [kept];
    });
  });

  handle(
    "transfer:pick-save",
    shape(isString),
    async (_e, name): Promise<string | null> => {
      const picked = await dialog.showSaveDialog({
        buttonLabel: dialogTextIn(currentLanguage(), "save"),
        defaultPath: join(app.getPath("downloads"), name),
        properties: ["createDirectory", "showOverwriteConfirmation"],
        title: dialogTextIn(currentLanguage(), "saveAs"),
      });

      return picked.canceled || !picked.filePath
        ? null
        : held().designate(picked.filePath);
    }
  );

  handle("transfer:pick-folder", shape(), async (): Promise<string | null> => {
    const picked = await dialog.showOpenDialog({
      buttonLabel: dialogTextIn(currentLanguage(), "choose"),
      defaultPath: app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"],
      title: dialogTextIn(currentLanguage(), "pickFolder"),
    });

    return picked.canceled ? null : held().designate(picked.filePaths[0] ?? "");
  });

  queue.restore();
}

export function pickedPath(path: unknown): path is string {
  return held().designated(path);
}

export function shutdownTransfers(): void {
  queue?.shutdown();
}
