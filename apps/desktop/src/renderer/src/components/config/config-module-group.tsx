import { useTranslations } from "@renderer/i18n/use-translations";
import type { FieldProblemView } from "@renderer/lib/catalog-selection";
import type { SecretMark } from "@shared/secrets";
import { Clock, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type FieldGroup, splitFields } from "../../lib/catalog-selection";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Details } from "../ui/details";
import { Panel } from "../ui/panel";
import { ServiceLogo } from "../ui/service-logo";
import { ConfigFieldControl, type FieldHandlers } from "./config-field-control";

/**
 * One service's questions, under its own name and logo.
 *
 * What has to be answered is asked first; what the manifest already answered
 * waits behind « Advanced settings », closed — unless one of those settings is
 * refused, in which case it opens on its own so the refusal is read. A service
 * with nothing to decide says so, rather than leaving the reader looking for a
 * question that is not there. What a service needs before its own questions —
 * an account it publishes through — is said above them.
 */
export function ConfigModuleGroup({
  group,
  values,
  marks,
  problems,
  before,
  position,
  focus = false,
  deferred = false,
  onDefer,
  handlers,
  held,
}: {
  group: FieldGroup;
  values: Record<string, unknown>;
  marks?: Record<string, SecretMark>;
  /** The secrets the machine already holds, restored from a backup. */
  held?: readonly string[];
  /** What this service gets wrong, already filtered to what may be shown. */
  problems: readonly FieldProblemView[];
  /** The connection this service declares, when it declares one. */
  before?: ReactNode;
  /** Where the service stands in the sequence; said only when there is one. */
  position?: { index: number; total: number };
  /** The reader just moved here: the heading takes the focus, and says so. */
  focus?: boolean;
  /** The reader put this service's questions off: nothing of it is asked. */
  deferred?: boolean;
  onDefer?: (later: boolean) => void;
  handlers: FieldHandlers;
}) {
  const t = useTranslations();
  const heading = useRef<HTMLHeadingElement>(null);
  const [advancedOpened, setAdvancedOpened] = useState(false);

  useEffect(() => {
    if (focus) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [focus]);

  function problemOf(key: string): string | undefined {
    return problems.find((one) => one.field === key)?.message;
  }

  const { asked, kept } = splitFields(group.fields);
  const keptRefused = kept.some((field) => problemOf(field.key));
  const asksSecret = asked.some((field) => field.kind === "secret");

  function control(field: FieldGroup["fields"][number]) {
    return (
      <ConfigFieldControl
        field={field}
        handlers={handlers}
        held={held}
        key={field.key}
        marks={marks}
        moduleId={group.module.id}
        problem={problemOf(field.key)}
        value={values[field.key]}
      />
    );
  }

  return (
    <Panel
      aria-labelledby={`group-${group.module.id}`}
      as="section"
      className="@container/module flex scroll-mt-4 flex-col gap-gutter"
      data-group={group.module.id}
      id={`config-${group.module.id}`}
      inset="lg"
    >
      <header className="flex items-center gap-3">
        <ServiceLogo
          moduleId={group.module.id}
          name={group.module.name}
          size={24}
        />
        <div className="min-w-0 flex-1">
          <h2
            className="font-medium text-ink outline-none"
            id={`group-${group.module.id}`}
            ref={heading}
            tabIndex={-1}
          >
            {group.module.name}
          </h2>
          <p className="text-[12px] text-ink-3">{group.module.summary}</p>
        </div>
        {position && position.total > 1 ? (
          <span className="shrink-0 font-data text-[12px] text-ink-3 tabular-nums">
            {t("config.module.position", position)}
          </span>
        ) : null}
      </header>

      {deferred ? (
        <div className="flex flex-col gap-3" data-deferred="true">
          <Callout tone="info">{t("config.later.notice")}</Callout>

          <div>
            <Button icon={Undo2} onClick={() => onDefer?.(false)} size="sm">
              {t("config.later.undo")}
            </Button>
          </div>
        </div>
      ) : null}

      {deferred ? null : before}

      {!deferred && group.fields.length === 0 ? (
        <p className="text-[12px] text-ink-3">{t("config.module.nothing")}</p>
      ) : null}

      {!deferred && group.fields.length > 0 && asked.length === 0 ? (
        <p className="text-[12px] text-ink-3" data-defaults="true">
          {t("config.module.defaults")}
        </p>
      ) : null}

      {!deferred && asked.length > 0 ? (
        <div className="grid @lg/module:grid-cols-2 gap-6" data-asked="true">
          {asked.map(control)}
        </div>
      ) : null}

      {!deferred && asksSecret ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
          {t("config.secretsNotice")}
        </p>
      ) : null}

      {!deferred && kept.length > 0 ? (
        <Details
          className="border-line border-t pt-4"
          label={t("config.advanced", { count: kept.length })}
          name="advanced"
          onOpenChange={setAdvancedOpened}
          open={advancedOpened || keptRefused}
        >
          <div className="mt-3 grid @lg/module:grid-cols-2 gap-6">
            {kept.map(control)}
          </div>
        </Details>
      ) : null}

      {/*
        Putting a service off is a decision about this installation, not about
        the service: it sits at the foot of its own panel, discreet, and never
        offered for a module the machine cannot do without.
      */}
      {!(deferred || group.module.mandatory) && onDefer ? (
        <div className="border-line border-t pt-4">
          <Button
            icon={Clock}
            onClick={() => onDefer(true)}
            size="sm"
            variant="discreet"
          >
            {t("config.later.defer")}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
