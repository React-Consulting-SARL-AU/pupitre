import { join } from "node:path";
import { app, dialog } from "electron";
import { type AppLog, appLog } from "./app-log";
import { dialogTextIn } from "./dialogs";
import { HARNESSED } from "./harness";
import { trace } from "./trace";

export interface FailureDeps {
  language: () => string;
  /** Lets go of forwards, terminals and channels before a relaunch. */
  release: () => void;
}

let log: AppLog | null = null;
let offering = false;

function logOf(): AppLog {
  log ??= appLog({ dir: join(app.getPath("userData"), "logs") });

  return log;
}

function noted(event: string, failure: unknown): void {
  const reason = failure instanceof Error ? failure.message : String(failure);

  logOf().failure(event, failure);
  trace("app", event, { reason });
  console.error(
    `[pupitre] ${event}: ${reason}\n  Written to ${logOf().path}; run the app with PUPITRE_TRACE=1 to see what led there.`
  );
}

async function offerRelaunch(
  otherwise: "continue" | "quit",
  deps: FailureDeps
): Promise<void> {
  if (HARNESSED || offering || !app.isReady()) {
    return;
  }

  offering = true;

  const language = deps.language();
  const text = (key: Parameters<typeof dialogTextIn>[1]) =>
    dialogTextIn(language, key);
  const { response } = await dialog.showMessageBox({
    buttons: [
      text("fatalRelaunch"),
      text(otherwise === "quit" ? "fatalQuit" : "fatalContinue"),
    ],
    cancelId: 1,
    defaultId: 0,
    detail: dialogTextIn(language, "fatalDetail", { path: logOf().path }),
    message: text("fatalTitle"),
    type: "error",
  });

  offering = false;

  if (response === 0) {
    deps.release();
    app.relaunch();
    app.exit(0);
  } else if (otherwise === "quit") {
    app.quit();
  }
}

function fatal(
  event: string,
  otherwise: "continue" | "quit",
  deps: FailureDeps
): (failure: unknown) => void {
  return (failure) => {
    noted(event, failure);
    offerRelaunch(otherwise, deps).catch((shown: unknown) =>
      noted("fatal-dialog", shown)
    );
  };
}

/** Returns the handler a failed start calls. */
export function watchFailures(deps: FailureDeps): (failure: unknown) => void {
  process.on("uncaughtException", fatal("uncaught", "continue", deps));
  // An unawaited rejection leaves the process sound: logged only, the other channels and terminals stand.
  process.on("unhandledRejection", (failure) => noted("unhandled", failure));

  return fatal("start-failed", "quit", deps);
}
