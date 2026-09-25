import { writeFile } from "node:fs/promises";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { saveShot } from "./shots-run";
import { pickedPath } from "./transfers";

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

export function registerShots(): void {
  handle("shots:save", shape(isString, isBytes), (_e, path, bytes) =>
    saveShot(path, bytes, {
      picked: pickedPath,
      write: (target, content) => writeFile(target, content),
    })
  );
}
