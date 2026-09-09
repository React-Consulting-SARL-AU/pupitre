import type { Manifest } from "@pupitre/shared/catalog";
import { ConfigFieldControl } from "@renderer/components/config/config-field-control";
import { ConnectionCard } from "@renderer/components/connections/connection-card";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { InstallProgress } from "@renderer/components/install/install-progress";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { ApplyState, ConfigState } from "@renderer/stores/services";
import type { SecretMarks } from "@shared/secrets";
import { RefreshCw } from "lucide-react";

/**
 * The configuration of an already installed module, as the agent kept it.
 *
 * The fields are the manifest's, filled with what the agent answered: the app
 * knows none of them in advance. A secret left empty stays the one the server
 * holds; a secret retyped goes to the main process and joins the installation's
 * secret stream, without ever passing through here.
 */
export function ServiceConfig({
  manifest,
  catalogHeld = false,
  onReloadCatalog,
  config,
  apply,
  values,
  secrets,
  steps,
  name,
  onValue,
  onSecret,
  onGenerate,
  onReveal,
  onApply,
}: {
  manifest: Manifest | null;
  /** The whole catalogue is refused, not this module's own settings. */
  catalogHeld?: boolean;
  onReloadCatalog?: () => void;
  config: ConfigState;
  apply: ApplyState;
  values: Record<string, unknown>;
  secrets: SecretMarks;
  steps: readonly ModuleProgress[];
  name: string;
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
  const connection = descriptorOf(manifest.connection ?? "");

  // A module that publishes through an account has that account to show, even
  // when everything else about it is derived: it used to be the one installed
  // module with no panel at all.
  if (fields.length === 0 && !manifest.connection) {
    return null;
  }

  const running = apply.status === "running";
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

      {config.status === "failed" ? <ErrorNotice error={config.error} /> : null}

      {config.status === "ready" ? (
        <div className="elevation-raised grid gap-4 rounded-md border border-line bg-surface p-5 sm:grid-cols-2">
          {fields.map((field) => (
            <ConfigFieldControl
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
            />
          ))}
        </div>
      ) : null}

      {connection ? <ConnectionCard compact connection={connection} /> : null}

      <p className="text-[12px] text-ink-3 leading-relaxed">
        {t("services.config.note")}
      </p>

      {running || apply.status === "done" ? (
        <InstallProgress modules={steps} nameOf={() => name} />
      ) : null}

      {apply.status === "failed" ? <ErrorNotice error={apply.error} /> : null}

      {apply.status === "done" ? (
        <Callout tone={failed.length > 0 ? "danger" : "info"}>
          {failed.length > 0
            ? t("services.config.failed", { name })
            : t("services.config.done", { name })}
        </Callout>
      ) : null}
    </section>
  );
}
