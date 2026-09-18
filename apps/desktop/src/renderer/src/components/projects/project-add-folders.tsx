import { Tooltip } from "@renderer/components/ui/tooltip";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { crumbsOf, under } from "@renderer/lib/files";
import { ChevronRight, Folder, RefreshCw } from "lucide-react";
import type { FolderState } from "../../stores/project-add";
import { FileTrail } from "../files/file-trail";
import { FolderCreate } from "../files/folder-create";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { EmptyState } from "../ui/empty-state";
import { WaitingNotice } from "../ui/waiting-notice";

/**
 * The folders of the server, walked rather than typed.
 *
 * Only folders are listed: what is being chosen is where a project lives, and
 * a file is never that. The trail and the new-folder dialog are the file
 * browser's own, so the two screens walk the server the same way.
 */
export function ProjectAddFolders({
  state,
  picked,
  onBrowse,
  onPick,
  onCreate,
}: {
  state: FolderState;
  /** The folder chosen so far, relative to the projects root. */
  picked: string;
  onBrowse: (path: string) => Promise<void> | void;
  onPick: (path: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const t = useTranslations();

  const path = state.status === "idle" ? "" : state.path;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <FileTrail
          crumbs={crumbsOf(path)}
          label={t("files.trail")}
          onBrowse={onBrowse}
          rootLabel={t("projectAdd.folders.root")}
        />

        <FolderCreate
          disabled={state.status !== "ready"}
          name="project.newFolder"
          onCreate={onCreate}
        />
      </div>

      {state.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => onBrowse(state.path)}>
              {t("common.retry")}
            </Button>
          }
          bare
          fix={agentText(t, state.error).fix}
          name="folders.failed"
          tone="danger"
        >
          {agentText(t, state.error).message}
        </Callout>
      ) : null}

      {state.status === "idle" || state.status === "loading" ? (
        <WaitingNotice title={t("projectAdd.folders.loading")} />
      ) : null}

      {state.status === "ready" ? (
        <div
          className="overflow-hidden rounded-md border border-line bg-sunken"
          data-folders={state.folders.length}
        >
          {state.folders.length === 0 ? (
            <EmptyState icon={Folder} title={t("projectAdd.folders.empty")} />
          ) : (
            <ul
              aria-label={t("projectAdd.folders.listLabel")}
              className="max-h-56 divide-y divide-line overflow-y-auto"
            >
              {state.folders.map((folder) => {
                const full = under(path, folder);

                return (
                  <li className="flex items-center gap-1" key={folder}>
                    <button
                      aria-pressed={full === picked}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-fast ${
                        full === picked ? "bg-raised" : "hover:bg-raised"
                      }`}
                      onClick={() => onPick(full)}
                      type="button"
                    >
                      <Folder
                        aria-hidden="true"
                        className="shrink-0 text-ink-3"
                        size={12}
                        strokeWidth={1.5}
                      />
                      <span className="truncate font-data text-[12px] text-ink">
                        {folder}
                      </span>
                    </button>

                    <Tooltip label={t("projectAdd.folders.enter", { folder })}>
                      <button
                        aria-label={t("projectAdd.folders.enter", { folder })}
                        className="clickable mr-1 shrink-0 rounded-sm p-1.5 text-ink-3 transition-fast hover:bg-raised hover:text-ink"
                        onClick={() => onBrowse(full)}
                        type="button"
                      >
                        <ChevronRight size={13} strokeWidth={1.5} />
                      </button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
