import { app } from "electron";
import { harnessOn } from "./dev-data-run";

/**
 * Whether a scenario run is driving the app.
 *
 * Such a run drives the window over the debugger, never over the desktop, and
 * a suite is a dozen launches in a row: nothing it does may reach whoever is
 * working on the machine, nor outlive it in a file of theirs.
 */
export const HARNESSED = harnessOn(
  process.env.PUPITRE_E2E,
  () => app.isPackaged
);
