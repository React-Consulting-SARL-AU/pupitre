import { devDefaultsFrom } from "./dev-defaults-run";
import { handle } from "./ipc";
import { shape } from "./ipc-guard";
import { buildKind } from "./platform-url";

export function registerDevDefaults(): void {
  handle("dev:defaults", shape(), () =>
    devDefaultsFrom(process.env, buildKind())
  );
}
