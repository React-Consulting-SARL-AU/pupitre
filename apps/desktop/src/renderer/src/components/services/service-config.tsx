import type { Manifest } from "@pupitre/shared/catalog";
import type { FieldProblem } from "@pupitre/shared/catalog/validate";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { panelClass } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { problemText, strayProblems } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { ApplyState, ConfigState } from "@renderer/stores/services";
import type { CloudflareZone } from "@shared/cloudflare";
import type { SecretMarks } from "@shared/secrets";
import { RefreshCw } from "lucide-react";
import { ServiceConfigField } from "./service-config-field";
import { ServiceConfigFooter } from "./service-config-footer";
import { ServiceConfigOutcome } from "./service-config-outcome";

/** A secret left empty keeps the one the server holds. */
export function ServiceConfig({
  manifest,
  configured = true,
  catalogHeld = false,
  onReloadCatalog,
  config,
  apply,
  values,
  secrets,
  problems = [],
  dirty = true,
  secretsDropped = false,
  steps,
  name,
  nameOf = (moduleId) => (moduleId === manifest?.id ? name : moduleId),
  zones = [],
  onValue,
  onSecret,
  onGenerate,
  onReveal,
  onApply,
  onDiscard,
}: {
  manifest: Manifest | null;
  /** False when the module was installed with its questions unanswered. */
  configured?: boolean;
  /** The whole catalogue is refused, not this module's own settings. */
  catalogHeld?: boolean;
  onReloadCatalog?: () => void;
  config: ConfigState;
  apply: ApplyState;
  values: Record<string, unknown>;
  secrets: SecretMarks;
  problems?: readonly FieldProblem[];
  dirty?: boolean;
  secretsDropped?: boolean;
  steps: readonly ModuleProgress[];
  name: string;
  /** An apply also replays dependencies, which need their own names. */
  nameOf?: (moduleId: string) => string;
  zones?: readonly CloudflareZone[];
  onValue: (key: string, value: unknown) => void;
  onSecret: (key: string, value: string) => void;
  onGenerate: (key: string) => void;
  onReveal: (key: string) => Promise<string | null>;
  onApply: () => void;
  onDiscard?: () => void;
}) {
  const t = useTranslations();

  // Without the catalogue's manifest, say why rather than drop the section.
  if (!manifest) {
    return (
      <Section data-config="unknown" title={t("services.config.title")}>
        <Callout
          action={
            catalogHeld || !onReloadCatalog ? null : (
              <Button icon={RefreshCw} onClick={onReloadCatalog} size="sm">
                {t("services.config.reread")}
              </Button>
            )
          }
        >
          {t(
            catalogHeld ? "services.config.heldBack" : "services.config.unread"
          )}
        </Callout>
      </Section>
    );
  }

  // A `managed` value is derived from a connection by the app, never typed.
  const fields = manifest.fields.filter((field) => field.managed !== true);

  if (fields.length === 0 && !manifest.connection) {
    return null;
  }

  const running = apply.status === "running";
  const ready = config.status === "ready";
  const held = ready ? config.held : [];
  const refused = problems.filter((problem) => problem.field !== "");
  const stray = strayProblems(
    t,
    problems,
    fields.map((field) => field.key),
    manifest
  );
  const accountOnly = fields.length === 0;

  function problemOf(key: string): string | undefined {
    const problem = refused.find((one) => one.field === key);

    return problem ? problemText(t, problem) : undefined;
  }

  return (
    <Section data-config={config.status} title={t("services.config.title")}>
      {configured ? null : (
        <Callout tone="warn">{t("services.config.unconfigured")}</Callout>
      )}

      {config.status === "failed" ? <ErrorNotice error={config.error} /> : null}

      {ready ? (
        <form
          className={`${panelClass("none")} flex flex-col`}
          data-dirty={dirty ? "true" : "false"}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          {accountOnly ? (
            <p className="px-6 py-5 text-control text-ink-2 leading-relaxed">
              {t("services.config.accountNote")}
            </p>
          ) : (
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              {fields.map((field) => (
                <ServiceConfigField
                  field={field}
                  handlers={{ onGenerate, onReveal, onSecret, onValue }}
                  held={held}
                  key={field.key}
                  marks={secrets[manifest.id]}
                  moduleId={manifest.id}
                  problem={problemOf(field.key)}
                  value={values[field.key]}
                  zones={zones}
                />
              ))}
            </div>
          )}

          <ServiceConfigFooter
            applicable={accountOnly}
            dirty={dirty && !accountOnly}
            onDiscard={onDiscard}
            refused={refused.length}
            running={running}
            stray={stray}
          />
        </form>
      ) : null}

      <ServiceConfigOutcome
        apply={apply}
        name={name}
        nameOf={nameOf}
        secretsDropped={secretsDropped}
        steps={steps}
      />
    </Section>
  );
}
