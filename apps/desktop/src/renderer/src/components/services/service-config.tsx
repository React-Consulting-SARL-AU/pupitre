import type { Manifest } from "@pupitre/shared/catalog";
import { InstallProgress } from "@renderer/components/install/install-progress";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { LiveDuration } from "@renderer/components/ui/live-duration";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { ApplyState, ConfigState } from "@renderer/stores/services";
import type { CloudflareZone } from "@shared/cloudflare";
import type { SecretMarks } from "@shared/secrets";
import { RefreshCw } from "lucide-react";
import { ServiceConfigField } from "./service-config-field";

/**
 * The configuration of an already installed module, as the agent kept it.
 *
 * The fields are the manifest's, filled with what the agent answered: the app
 * knows none of them in advance. A secret left empty stays the one the server
 * holds; a secret retyped goes to the main process and joins the installation's
 * secret stream, without ever passing through here. A module whose every value
 * is derived from an account has nothing to type and one gesture left: apply,
 * which sends that account to the server again.
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
  steps,
  name,
  nameOf = (moduleId) => (moduleId === manifest?.id ? name : moduleId),
  zones = [],
  onValue,
  onSecret,
  onGenerate,
  onReveal,
  onApply,
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
}) {
  const t = useTranslations();

  // The settings of a module are its manifest's, which comes from the server's
  // catalogue. Without it the form cannot be drawn, and a section that simply
  // disappeared left the reader looking for what a service can be told.
  if (!manifest) {
    return (
      <section className="flex flex-col gap-3" data-config="unknown">
        <Label>{t("services.config.title")}</Label>

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
      </section>
    );
  }

  // A `managed` value is derived from a connection by the app, never typed.
  const fields = manifest.fields.filter((field) => field.managed !== true);

  if (fields.length === 0 && !manifest.connection) {
    return null;
  }

  const running = apply.status === "running";
  const unconfigured = !configured;
  const held = config.status === "ready" ? config.held : [];
  const failed = apply.status === "done" ? apply.result.failed : [];

  return (
    <section className="flex flex-col gap-3" data-config={config.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>{t("services.config.title")}</Label>

        <Button
          disabled={config.status !== "ready"}
          icon={RefreshCw}
          loading={running}
          onClick={onApply}
          size="sm"
        >
          {t("services.config.apply")}
        </Button>
      </div>

      {unconfigured ? (
        <Callout tone="warn">{t("services.config.unconfigured")}</Callout>
      ) : null}

      {running ? (
        <WaitingLine className="text-[12px]">
          <span>{t("services.config.applying", { name })}</span>
          <LiveDuration className="font-data tabular-nums" />
        </WaitingLine>
      ) : null}

      {running || apply.status === "done" ? (
        <InstallProgress modules={steps} nameOf={nameOf} />
      ) : null}

      {apply.status === "failed" ? <ErrorNotice error={apply.error} /> : null}

      {apply.status === "done" ? (
        <Callout tone={failed.length > 0 ? "danger" : "info"}>
          {failed.length > 0
            ? t("services.config.failed", { name })
            : t("services.config.done", { name })}
        </Callout>
      ) : null}

      {config.status === "failed" ? <ErrorNotice error={config.error} /> : null}

      {config.status === "ready" && fields.length > 0 ? (
        <div className="elevation-raised grid gap-4 rounded-md border border-line bg-surface p-5 sm:grid-cols-2">
          {fields.map((field) => (
            <ServiceConfigField
              field={field}
              handlers={{
                onGenerate,
                onReveal,
                onSecret,
                onValue,
              }}
              held={held}
              key={field.key}
              marks={secrets[manifest.id]}
              moduleId={manifest.id}
              value={values[field.key]}
              zones={zones}
            />
          ))}
        </div>
      ) : null}

      <p className="text-[12px] text-ink-3 leading-relaxed">
        {t(
          fields.length > 0
            ? "services.config.note"
            : "services.config.accountNote"
        )}
      </p>
    </section>
  );
}
