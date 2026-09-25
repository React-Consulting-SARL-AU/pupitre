import { app } from "electron";
import { harnessOn } from "./dev-data-run";

/** A scenario run must never reach whoever works on the machine, nor outlive itself in their files. */
export const HARNESSED = harnessOn(
  process.env.PUPITRE_E2E,
  () => app.isPackaged
);
