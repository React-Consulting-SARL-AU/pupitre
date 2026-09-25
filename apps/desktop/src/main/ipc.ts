import { type IpcMainEvent, type IpcMainInvokeEvent, ipcMain } from "electron";
import { guarded, IpcRefused } from "./ipc-guard";

/** `ipcMain.handle`, behind the checks of `ipc-guard.ts`. */
export function handle<A extends unknown[], R>(
  channel: string,
  parse: (args: unknown[]) => A | null,
  run: (event: IpcMainInvokeEvent, ...args: A) => R
): void {
  ipcMain.handle(channel, guarded(channel, parse, run));
}

/** The same, for a channel the page sends on without waiting: a refusal goes nowhere. */
export function listen<A extends unknown[]>(
  channel: string,
  parse: (args: unknown[]) => A | null,
  run: (event: IpcMainEvent, ...args: A) => void
): void {
  const checked = guarded(channel, parse, run);

  ipcMain.on(channel, (event, ...raw: unknown[]) => {
    try {
      checked(event, ...raw);
    } catch (failure) {
      if (!(failure instanceof IpcRefused)) {
        throw failure;
      }
    }
  });
}
