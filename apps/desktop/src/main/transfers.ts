import { join } from "node:path";
import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import type { AgentResponse } from "@shared/agent";
import type { TransferList } from "@shared/transfers";
import { app, dialog, ipcMain } from "electron";
import { agentClient, currentLanguage } from "./agent";
import { broadcast } from "./broadcast";
import { dialogTextIn } from "./dialogs";
import { current } from "./platform";
import { byId, paths } from "./servers";
import { sshArgs } from "./ssh-config";
import { createTransferQueue, type TransferQueue } from "./transfers-run";

/**
 * The transfers, on their channels.
 *
 * The renderer never names a path of this computer on its own: it opens one
 * of the three dialogs below, or drops a file, and only a path the user
 * pointed at reaches the queue. What it names on the server is a path under
 * the agent's root, checked again over there.
 */

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

  ipcMain.handle("transfer:list", (): TransferList => held().list());

  ipcMain.handle(
    "transfer:upload",
    (_e, serverId: unknown, remoteDir: unknown, localPaths: unknown) =>
      held().upload(serverId, remoteDir, localPaths)
  );

  ipcMain.handle(
    "transfer:download",
    (_e, serverId: unknown, remotePath: unknown, localPath: unknown) =>
      held().download(serverId, remotePath, localPath)
  );

  ipcMain.handle("transfer:pause", (_e, id: unknown) => held().pause(id));
  ipcMain.handle("transfer:resume", (_e, id: unknown) => held().resume(id));
  ipcMain.handle("transfer:cancel", (_e, id: unknown) => held().cancel(id));
  ipcMain.handle("transfer:dismiss", (_e, id: unknown) => held().dismiss(id));

  /** A file dropped on the window: the preload read its path, and says so here. */
  ipcMain.handle("transfer:dropped", (_e, path: unknown) =>
    held().designate(path)
  );

  ipcMain.handle("transfer:pick-upload", async (): Promise<string[]> => {
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

  ipcMain.handle(
    "transfer:pick-save",
    async (_e, name: unknown): Promise<string | null> => {
      const picked = await dialog.showSaveDialog({
        buttonLabel: dialogTextIn(currentLanguage(), "save"),
        defaultPath: join(
          app.getPath("downloads"),
          typeof name === "string" ? name : ""
        ),
        properties: ["createDirectory", "showOverwriteConfirmation"],
        title: dialogTextIn(currentLanguage(), "saveAs"),
      });

      return picked.canceled || !picked.filePath
        ? null
        : held().designate(picked.filePath);
    }
  );

  ipcMain.handle("transfer:pick-folder", async (): Promise<string | null> => {
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

/** Whether a local path came out of one of the dialogs above, and may be written to. */
export function pickedPath(path: unknown): path is string {
  return held().designated(path);
}

export function shutdownTransfers(): void {
  queue?.shutdown();
}
