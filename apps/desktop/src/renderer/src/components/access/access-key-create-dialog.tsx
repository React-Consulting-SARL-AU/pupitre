import {
  ACCESS_KEY_NAME_MAX,
  type AccessKey,
} from "@pupitre/shared/agent-protocol/access";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AccessGesture } from "@renderer/stores/access";
import type { AccessCopyForm } from "@shared/access";
import { Copy, KeyRound, Link, Type } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { CheckLine } from "../ui/check-line";
import { Dialog } from "../ui/dialog";
import { ErrorNotice } from "../ui/error-notice";
import { controlClass, Field, fieldAria } from "../ui/field";
import { RadioGroup, RadioLine } from "../ui/radio";
import { AccessCopied } from "./access-copied";

type Scope = "project" | "all" | "chosen";

export function AccessKeyCreateDialog({
  project,
  projects,
  gesture,
  hostnamesFor,
  onCreate,
  onCopy,
  onClose,
}: {
  /** The project the dialog was opened from; absent on the server's page. */
  project: string | null;
  /** Every project of the server, for a key that opens some of them. */
  projects: readonly string[];
  gesture: AccessGesture;
  hostnamesFor: (key: AccessKey) => string[];
  onCreate: (name: string, scope: string[] | null) => Promise<AccessKey | null>;
  onCopy: (
    key: AccessKey,
    form: AccessCopyForm,
    hostname: string | null
  ) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();

  const input = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>(project ? "project" : "all");
  const [chosen, setChosen] = useState<string[]>([]);
  const [created, setCreated] = useState<AccessKey | null>(null);

  const trimmed = name.trim();

  function projectsOf(): string[] | null {
    if (scope === "all") {
      return null;
    }

    return scope === "project" && project ? [project] : chosen;
  }

  const wanted = projectsOf();
  const ready = trimmed.length > 0 && (wanted === null || wanted.length > 0);

  async function create() {
    if (!ready) {
      return;
    }

    const key = await onCreate(trimmed, wanted);

    if (key) {
      setCreated(key);
    }
  }

  if (created) {
    const [link] = hostnamesFor(created);

    return (
      <Dialog
        actions={
          <Button onClick={onClose} size="sm" variant="inverse">
            {t("access.create.close")}
          </Button>
        }
        name="access-created"
        onClose={onClose}
        open
        title={t("access.create.done", { name: created.name })}
      >
        <div className="flex flex-col gap-5">
          <p className="text-ink-3 text-small leading-relaxed">
            {t("access.create.doneDetail")}
          </p>

          <div className="flex flex-wrap gap-2">
            {link ? (
              <Button
                icon={Link}
                onClick={() => onCopy(created, "link", link)}
                size="sm"
              >
                {t("access.key.copyLink", { hostname: link })}
              </Button>
            ) : null}
            <Button
              icon={Type}
              onClick={() => onCopy(created, "header", null)}
              size="sm"
            >
              {t("access.key.copyHeader")}
            </Button>
            <Button
              icon={Copy}
              onClick={() => onCopy(created, "key", null)}
              size="sm"
            >
              {t("access.key.copyKey")}
            </Button>
          </div>

          <AccessCopied gesture={gesture} id={created.id} />
        </div>
      </Dialog>
    );
  }

  const refused = gesture.status === "failed" && gesture.id === null;

  return (
    <Dialog
      actions={
        <>
          <Button onClick={onClose} size="sm" variant="discreet">
            {t("access.create.cancel")}
          </Button>
          <Button
            disabled={!ready}
            icon={KeyRound}
            onClick={create}
            size="sm"
            variant="inverse"
          >
            {t("access.create.submit")}
          </Button>
        </>
      }
      focus={input}
      name="access-create"
      onClose={onClose}
      open
      title={t("access.create.title")}
      width="wide"
    >
      <div className="flex flex-col gap-6">
        <Field
          help={t("access.create.nameHelp")}
          label={t("access.create.name")}
          name="access.name"
          required
        >
          <input
            {...fieldAria({ name: "access.name", problem: false })}
            className={controlClass("prose", false)}
            maxLength={ACCESS_KEY_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                create();
              }
            }}
            placeholder={t("access.create.namePlaceholder")}
            ref={input}
            value={name}
          />
        </Field>

        <Field label={t("access.create.scope")} name="access.scope">
          <RadioGroup
            className="flex flex-col gap-3"
            label={t("access.create.scope")}
            name="access.scope"
            onChange={(next) => setScope(next as Scope)}
            value={scope}
          >
            {project ? (
              <RadioLine
                label={t("access.create.scope.project", { name: project })}
                value="project"
              />
            ) : null}
            <RadioLine label={t("access.create.scope.all")} value="all" />
            {project ? null : (
              <RadioLine
                label={t("access.create.scope.chosen")}
                value="chosen"
              />
            )}
          </RadioGroup>
        </Field>

        {scope === "chosen" ? (
          <fieldset
            aria-label={t("access.create.projects")}
            className="-mt-3 flex flex-col gap-3 pl-7"
          >
            {projects.map((candidate) => (
              <CheckLine
                checked={chosen.includes(candidate)}
                key={candidate}
                label={candidate}
                name={`access.project.${candidate}`}
                onChange={(next) =>
                  setChosen((current) =>
                    next
                      ? [...current, candidate]
                      : current.filter((held) => held !== candidate)
                  )
                }
              />
            ))}
          </fieldset>
        ) : null}

        {refused ? <ErrorNotice error={gesture.error} /> : null}
      </div>
    </Dialog>
  );
}
