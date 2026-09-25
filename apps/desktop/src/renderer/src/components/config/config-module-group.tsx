import { useTranslations } from "@renderer/i18n/use-translations";
import type { FieldProblemView } from "@renderer/lib/catalog-selection";
import type { SecretMark } from "@shared/secrets";
import { Clock, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type FieldGroup, splitFields } from "../../lib/catalog-selection";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Details } from "../ui/details";
import { RequiredLegend } from "../ui/field";
import { Panel } from "../ui/panel";
import { ServiceLogo } from "../ui/service-logo";
import {
  ConfigFieldControl,
  type FieldHandlers,
  isRequired,
} from "./config-field-control";

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
  held?: readonly string[];
  problems: readonly FieldProblemView[];
  before?: ReactNode;
  position?: { index: number; total: number };
  focus?: boolean;
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
  const advancedOpen = advancedOpened || keptRefused;
  const asksRequired = asked.some(isRequired);
  const keepsRequired = advancedOpen && !asksRequired && kept.some(isRequired);
  const legend = <RequiredLegend>{t("common.field.required")}</RequiredLegend>;

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
          <p className="text-ink-3 text-small">{group.module.summary}</p>
        </div>
        {position && position.total > 1 ? (
          <span className="shrink-0 font-data text-ink-3 text-small tabular-nums">
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
        <p className="text-ink-3 text-small">{t("config.module.nothing")}</p>
      ) : null}

      {!deferred && group.fields.length > 0 && asked.length === 0 ? (
        <p className="text-ink-3 text-small" data-defaults="true">
          {t("config.module.defaults")}
        </p>
      ) : null}

      {!deferred && asked.length > 0 ? (
        <div className="grid @lg/module:grid-cols-2 gap-6" data-asked="true">
          {asked.map(control)}
        </div>
      ) : null}

      {!deferred && asksRequired ? legend : null}

      {!deferred && asksSecret ? (
        <p className="text-ink-3 text-small leading-relaxed">
          {t("config.secretsNotice")}
        </p>
      ) : null}

      {!deferred && kept.length > 0 ? (
        <Details
          className="border-line border-t pt-4"
          label={t("config.advanced", { count: kept.length })}
          name="advanced"
          onOpenChange={setAdvancedOpened}
          open={advancedOpen}
        >
          <div className="mt-3 grid @lg/module:grid-cols-2 gap-6">
            {kept.map(control)}
          </div>
          {keepsRequired ? <div className="mt-6">{legend}</div> : null}
        </Details>
      ) : null}

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
