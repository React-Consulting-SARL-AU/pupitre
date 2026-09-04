import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { SecretsState } from "@renderer/stores/secrets";
import type { AgentError } from "@shared/agent";
import { KeyRound, RotateCw, ShieldCheck } from "lucide-react";
import { SecretsRow } from "./secrets-row";

/**
 * The keys the agent keeps in `/etc/pupitre/env`, and their state alone.
 *
 * Which keys exist and what has to be restarted after changing one: all of that
 * comes from the server. A screen that named a file or a password manager here
 * would be wrong on the next machine, and has no way of knowing anyway.
 */
export function SecretsPanel({
  state,
  saving,
  saved,
  problem,
  open,
  onOpen,
  onSave,
  onReload,
}: {
  state: SecretsState;
  saving: string | null;
  saved: string | null;
  problem: AgentError | null;
  open: string | null;
  onOpen: (key: string | null) => void;
  onSave: (key: string, value: string) => void;
  onReload: () => void;
}) {
  const t = useTranslations();

  const secrets = state.status === "read" ? state.secrets : [];
  const filled = secrets.filter((secret) => secret.set).length;

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-gutter">
        <PageHeader
          description={t("secrets.description")}
          eyebrow={t("secrets.eyebrow")}
          title={t("secrets.title")}
        />

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-data text-[11px] text-ink-3">
            <ShieldCheck size={13} strokeWidth={1.5} />
            {state.status === "read"
              ? t("secrets.inPlace", { filled, total: secrets.length })
              : t("secrets.reading")}
          </span>
          <Button
            className="ml-auto"
            icon={RotateCw}
            onClick={onReload}
            size="sm"
          >
            {t("secrets.reload")}
          </Button>
        </div>

        {state.status === "failed" ? (
          <ErrorNotice error={state.error} onRetry={onReload} />
        ) : null}

        {problem ? <ErrorNotice error={problem} /> : null}

        {saved ? (
          <Callout tone="info">{t("secrets.saved", { key: saved })}</Callout>
        ) : null}

        <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
          {state.status === "idle" || state.status === "reading" ? (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-ink-3">
              <StatusDot shape="breathing" size={11} />
              {t("secrets.readingKeys")}
            </p>
          ) : null}

          {state.status === "read" && secrets.length === 0 ? (
            <EmptyState
              detail={t("secrets.emptyDetail")}
              icon={KeyRound}
              title={t("secrets.emptyTitle")}
            />
          ) : null}

          {secrets.map((secret) => (
            <SecretsRow
              key={secret.key}
              onOpen={() => onOpen(open === secret.key ? null : secret.key)}
              onSave={(value) => onSave(secret.key, value)}
              open={open === secret.key}
              saving={saving === secret.key}
              secret={secret}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
