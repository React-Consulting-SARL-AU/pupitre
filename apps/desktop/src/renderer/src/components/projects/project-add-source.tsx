import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { GithubRepo } from "@shared/github";
import { FolderGit2, HardDrive, Link2, Package } from "lucide-react";
import type {
  DetectionState,
  Draft,
  FolderState,
  ReposState,
  SourceKind,
} from "../../stores/project-add";
import type { ButtonIcon } from "../ui/button";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Field, fieldControlClass } from "../ui/field";
import { ModeCard, ModeCards } from "../ui/mode-card";
import { ProjectAddFolders } from "./project-add-folders";
import { ProjectAddRepos } from "./project-add-repos";

const KINDS: {
  kind: SourceKind;
  icon: ButtonIcon;
  title: DictionaryKey;
  detail: DictionaryKey;
}[] = [
  {
    detail: "projectAdd.source.github.detail",
    icon: FolderGit2,
    kind: "github",
    title: "projectAdd.source.github.title",
  },
  {
    detail: "projectAdd.source.git.detail",
    icon: Link2,
    kind: "git",
    title: "projectAdd.source.git.title",
  },
  {
    detail: "projectAdd.source.dir.detail",
    icon: HardDrive,
    kind: "dir",
    title: "projectAdd.source.dir.title",
  },
];

export interface SourceEdits {
  kind: (kind: SourceKind) => void;
  source: (value: string) => void;
  branch: (value: string) => void;
  pickRepo: (repo: GithubRepo) => void;
  pickFolder: (path: string) => void;
  browse: (path: string) => Promise<void> | void;
  createFolder: (name: string) => Promise<AgentError | null>;
  loadRepos: (refresh?: boolean) => Promise<void>;
}

export function ProjectAddSource({
  draft,
  detection,
  repos,
  folders,
  githubModule,
  edit,
  onConnect,
  onInstallModule,
}: {
  draft: Draft;
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  githubModule: boolean;
  edit: SourceEdits;
  onConnect: () => void;
  onInstallModule: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-6">
      <ModeCards
        label={t("projectAdd.source.label")}
        onChange={edit.kind}
        value={draft.kind}
      >
        {KINDS.map((option) => (
          <ModeCard
            detail={t(option.detail)}
            icon={option.icon}
            key={option.kind}
            title={t(option.title)}
            value={option.kind}
          />
        ))}
      </ModeCards>

      {draft.kind === "github" ? (
        <ProjectAddRepos
          onConnect={onConnect}
          onPick={edit.pickRepo}
          onRefresh={() => edit.loadRepos(true)}
          picked={draft.source}
          state={repos}
        />
      ) : null}

      {draft.kind === "git" ? (
        <Field
          help={t("projectAdd.form.sourceHelp")}
          label={t("projectAdd.form.sourceLabel")}
          name="project.source"
          required
        >
          <input
            aria-busy={detection.status === "reading"}
            aria-describedby="project.source-help"
            className={fieldControlClass}
            id="project.source"
            onChange={(event) => edit.source(event.target.value)}
            placeholder={t("projectAdd.form.sourcePlaceholder")}
            value={draft.source}
          />
        </Field>
      ) : null}

      {draft.kind === "dir" ? (
        <ProjectAddFolders
          onBrowse={edit.browse}
          onCreate={edit.createFolder}
          onPick={edit.pickFolder}
          picked={draft.source}
          state={folders}
        />
      ) : null}

      {draft.kind === "dir" ? null : (
        <Field
          help={t("projectAdd.form.branchHelp")}
          label={t("projectAdd.form.branchLabel")}
          name="project.branch"
        >
          <input
            aria-busy={detection.status === "reading"}
            className={fieldControlClass}
            id="project.branch"
            onChange={(event) => edit.branch(event.target.value)}
            placeholder={t("projectAdd.form.branchPlaceholder")}
            value={draft.branch}
          />
        </Field>
      )}

      {/* A private clone needs the git identity the GitHub module installs: warn before it fails. */}
      {draft.privateRepo && !githubModule ? (
        <Callout
          action={
            <Button icon={Package} onClick={onInstallModule}>
              {t("projectAdd.github.install")}
            </Button>
          }
          bare
          fix={t("projectAdd.github.moduleFix")}
          name="github.module"
          tone="warn"
        >
          {t("projectAdd.github.module")}
        </Callout>
      ) : null}
    </div>
  );
}
