import type { Manifest } from "@pupitre/shared/catalog";
import type { FieldProblem } from "@pupitre/shared/catalog/validate";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { panelClass } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { problemText } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { ApplyState, ConfigState } from "@renderer/stores/services";
import type { CloudflareZone } from "@shared/cloudflare";
import type { SecretMarks } from "@shared/secrets";
import { RefreshCw } from "lucide-react";
import { ServiceConfigField } from "./service-config-field";
import { ServiceConfigFooter } from "./service-config-footer";
import { ServiceConfigOutcome } from "./service-config-outcome";

/**
 * The configuration of an already installed module, as the agent kept it.
 *
 * The fields are the manifest's, filled with what the agent answered: the app
 * knows none of them in advance. A secret left empty stays the one the server
 * holds; a secret retyped goes to the main process and joins the installation's
 * secret stream, without ever passing through here. A module whose every value
 * is derived from an account has nothing to type and one gesture left: apply,
 * which sends that account to the server again.
 *
 * The form ends on its gesture: apply stands at its foot, with the way back
 * beside it, and neither has anything to do until a value or a secret differs
 * from what the server holds. What a value is refused for is said under it.
 */
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
  /** False for a module put on the machine with its questions left unanswered. */
  configured?: boolean;
  /** The whole catalogue is refused, not this module's own settings. */
  catalogHeld?: boolean;
  onReloadCatalog?: () => void;
  config: ConfigState;
  apply: ApplyState;
  values: Record<string, unknown>;
  secrets: SecretMarks;
  /** What the form or the server refuses, each on the field it names. */
  problems?: readonly FieldProblem[];
  /** Whether anything differs from what the server holds. */
  dirty?: boolean;
  /** A refusal took the typed secrets with it: they have to be typed again. */
  secretsDropped?: boolean;
  steps: readonly ModuleProgress[];
  name: string;
  /** What to call a module the run brought along — a dependency the agent replays — rather than this one's name for every row. */
  nameOf?: (moduleId: string) => string;
  /** The zones of the account an exposure publishes through: its domain is picked among them. */
  zones?: readonly CloudflareZone[];
  onValue: (key: string, value: unknown) => void;
  onSecret: (key: string, value: string) => void;
  onGenerate: (key: string) => void;
  onReveal: (key: string) => Promise<string | null>;
  onApply: () => void;
  onDiscard?: () => void;
}) {
  const t = useTranslations();

  // The settings of a module are its manifest's, which comes from the server's
  // catalogue. Without it the form cannot be drawn, and a section that simply
  // disappeared left the reader looking for what a service can be told.
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
            <p className="px-6 py-5 text-[13px] text-ink-2 leading-relaxed">
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
