import { writeFile } from "node:fs/promises";
import { ipcMain } from "electron";
import { saveShot } from "./shots-run";
import { pickedPath } from "./transfers";

export function registerShots(): void {
  ipcMain.handle("shots:save", (_e, path: unknown, bytes: unknown) =>
    saveShot(path, bytes, {
      picked: pickedPath,
      write: (target, content) => writeFile(target, content),
    })
  );
}
