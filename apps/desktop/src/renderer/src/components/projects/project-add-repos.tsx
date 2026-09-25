import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { GithubRepo } from "@shared/github";
import { RefreshCw, Search, Settings } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReposState } from "../../stores/project-add";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Field, fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import { WaitingNotice } from "../ui/waiting-notice";
import { ProjectAddRepoPicked } from "./project-add-repo-picked";
import { ProjectAddRepoRow } from "./project-add-repo-row";

function matching(
  repos: readonly GithubRepo[],
  filter: string
): readonly GithubRepo[] {
  const wanted = filter.trim().toLowerCase();

  if (wanted.length === 0) {
    return repos;
  }

  return repos.filter((repo) => repo.fullName.toLowerCase().includes(wanted));
}

export function ProjectAddRepos({
  state,
  picked,
  onPick,
  onRefresh,
  onConnect,
}: {
  state: ReposState;
  /** Clone URL of the chosen repository, or empty. */
  picked: string;
  onPick: (repo: GithubRepo) => void;
  onRefresh: () => Promise<void> | void;
  onConnect: () => void;
}) {
  const t = useTranslations();

  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const repos = state.status === "ready" ? state.repos : [];
  const shown = useMemo(() => matching(repos, filter), [repos, filter]);
  const chosen = repos.find((repo) => repo.cloneUrl === picked);

  useEffect(() => {
    if (changing) {
      input.current?.focus();
    }
  }, [changing]);

  function close() {
    setOpen(false);
    setChanging(false);
  }

  function pick(repo: GithubRepo) {
    setFilter("");
    close();
    onPick(repo);
  }

  function leave(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      close();
    }
  }

  function key(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
    }
  }

  if (state.status === "absent") {
    return (
      <Callout
        action={
          <Button icon={Settings} onClick={onConnect}>
            {t("projectAdd.github.connect")}
          </Button>
        }
        bare
        fix={t("projectAdd.github.absentFix")}
        name="github.absent"
        tone="info"
      >
        {t("projectAdd.github.absent")}
      </Callout>
    );
  }

  if (state.status === "failed") {
    return (
      <Callout
        action={
          <Button icon={RefreshCw} onClick={onRefresh}>
            {t("common.retry")}
          </Button>
        }
        bare
        fix={agentText(t, state.error).fix}
        name="github.failed"
        tone="danger"
      >
        {agentText(t, state.error).message}
      </Callout>
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return <WaitingNotice title={t("projectAdd.github.loading")} />;
  }

  if (chosen && !changing) {
    return (
      <ProjectAddRepoPicked onChange={() => setChanging(true)} repo={chosen} />
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: not a gesture, focus leaving the search and its list folds the list
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same reason
    <div className="flex flex-col gap-2" data-repos-open={open} onBlur={leave}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field
            label={t("projectAdd.github.filterLabel")}
            name="project.repoFilter"
            required
          >
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4"
                size={13}
                strokeWidth={1.5}
              />
              <input
                className={`${fieldControlClass} pl-8`}
                id="project.repoFilter"
                onChange={(event) => setFilter(event.target.value)}
                onFocus={() => setOpen(true)}
                onKeyDown={key}
                placeholder={t.plural(
                  "projectAdd.github.filterPlaceholder",
                  repos.length
                )}
                ref={input}
                type="search"
                value={filter}
              />
            </div>
          </Field>
        </div>

        <IconButton
          icon={RefreshCw}
          label={t("projectAdd.github.refresh")}
          onClick={onRefresh}
        />
      </div>

      {open ? (
        <div className="overflow-hidden rounded-md border border-line bg-sunken">
          {shown.length === 0 ? (
            <p className="px-3 py-3 text-ink-3 text-small leading-relaxed">
              {t("projectAdd.github.empty")} ·{" "}
              {t("projectAdd.github.emptyDetail")}
            </p>
          ) : (
            <ul
              aria-label={t("projectAdd.github.listLabel")}
              className="max-h-64 divide-y divide-line overflow-y-auto"
              data-repos={shown.length}
            >
              {shown.map((repo) => (
                <li key={repo.fullName}>
                  <ProjectAddRepoRow
                    onPick={() => pick(repo)}
                    picked={repo.cloneUrl === picked}
                    privateLabel={t("projectAdd.github.private")}
                    repo={repo}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
