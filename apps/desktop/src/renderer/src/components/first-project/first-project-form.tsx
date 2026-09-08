import {
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import { FolderPlus } from "lucide-react";
import type { Draft } from "../../stores/first-project";
import { Button } from "../ui/button";
import { CheckBox } from "../ui/check-box";
import { Field, fieldControlClass } from "../ui/field";

/**
 * What the agent needs to know about a project, asked once.
 *
 * The address fills the rest in: the name comes off its last segment, the port
 * is one no declared project holds, the start command follows the package
 * manager. Everything proposed here stays editable — the machine decides what
 * it accepts, and says so.
 */
export interface DraftEdits {
  source: (value: string) => void;
  name: (value: string) => void;
  pkgmgr: (value: PackageManager) => void;
  port: (value: number) => void;
  subdomain: (value: string) => void;
  publish: (value: boolean) => void;
  cmd: (value: string) => void;
}

export function FirstProjectForm({
  draft,
  detected,
  cloudflare,
  publish,
  ready,
  edit,
  onSubmit,
}: {
  draft: Draft;
  /** The package manager came from a project the agent already declares. */
  detected: boolean;
  cloudflare: boolean;
  /** The address is drawn by the platform: the reader chooses to publish, not the name. */
  publish: boolean;
  ready: boolean;
  edit: DraftEdits;
  onSubmit: () => void;
}) {
  const t = useTranslations();

  return (
    <form
      className="elevation-raised flex flex-col gap-gutter rounded-md border border-line bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field
        help={t("firstProject.form.sourceHelp")}
        label={t("firstProject.form.sourceLabel")}
      >
        <input
          className={fieldControlClass}
          onChange={(event) => edit.source(event.target.value)}
          placeholder={t("firstProject.form.sourcePlaceholder")}
          value={draft.source}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          help={
            draft.dir
              ? t("firstProject.form.folderHelp", { dir: draft.dir })
              : t("firstProject.form.nameHelp")
          }
          label={t("firstProject.form.nameLabel")}
        >
          <input
            className={fieldControlClass}
            onChange={(event) => edit.name(event.target.value)}
            placeholder={t("firstProject.form.namePlaceholder")}
            value={draft.name}
          />
        </Field>

        <Field
          help={
            detected
              ? t("firstProject.form.pkgmgrDetected")
              : t("firstProject.form.pkgmgrHelp")
          }
          label={t("firstProject.form.pkgmgrLabel")}
        >
          <select
            className={fieldControlClass}
            onChange={(event) =>
              edit.pkgmgr(event.target.value as PackageManager)
            }
            value={draft.pkgmgr}
          >
            {PACKAGE_MANAGERS.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </select>
        </Field>

        <Field
          help={t("firstProject.form.portHelp")}
          label={t("firstProject.form.portLabel")}
        >
          <input
            className={fieldControlClass}
            inputMode="numeric"
            onChange={(event) => edit.port(event.target.valueAsNumber)}
            type="number"
            value={Number.isFinite(draft.port) ? draft.port : ""}
          />
        </Field>

        {cloudflare ? (
          <Field
            help={t("firstProject.form.publishHelp")}
            label={t("firstProject.form.publishLabel")}
          >
            <CheckBox
              checked={publish}
              label={t("firstProject.form.publishLabel")}
              name="publish"
              onChange={edit.publish}
            />
          </Field>
        ) : null}

        {cloudflare ? (
          <Field
            help={t("firstProject.form.subdomainHelp")}
            label={t("firstProject.form.subdomainLabel")}
          >
            <input
              className={fieldControlClass}
              onChange={(event) => edit.subdomain(event.target.value)}
              placeholder={draft.name}
              value={draft.subdomain}
            />
          </Field>
        ) : null}
      </div>

      <Field
        help={t("firstProject.form.cmdHelp")}
        label={t("firstProject.form.cmdLabel")}
      >
        <input
          className={fieldControlClass}
          onChange={(event) => edit.cmd(event.target.value)}
          placeholder={t("firstProject.form.cmdPlaceholder")}
          value={draft.cmd}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button disabled={!ready} icon={FolderPlus} submit variant="inverse">
          {t("firstProject.form.submit")}
        </Button>
      </div>
    </form>
  );
}
