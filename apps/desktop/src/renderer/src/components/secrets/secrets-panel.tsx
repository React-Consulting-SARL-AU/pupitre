import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
import { StatusDot } from "@renderer/components/ui/status-dot";
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
  const secrets = state.status === "read" ? state.secrets : [];
  const filled = secrets.filter((secret) => secret.set).length;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <PageHeader
          description="Les clés d'environnement que le serveur garde pour ses services — lui seul sait lesquelles et où. L'app n'en voit que l'état : une valeur remplacée part sur le flux secret du protocole et ne revient pas."
          eyebrow="Serveur"
          title="Secrets"
        />

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-data text-[11px] text-ink-3">
            <ShieldCheck size={13} strokeWidth={1.5} />
            {state.status === "read"
              ? `${filled} sur ${secrets.length} en place`
              : "lecture…"}
          </span>
          <Button
            className="ml-auto"
            icon={RotateCw}
            onClick={onReload}
            size="sm"
          >
            Recharger
          </Button>
        </div>

        {state.status === "failed" ? (
          <ErrorNotice error={state.error} onRetry={onReload} />
        ) : null}

        {problem ? <ErrorNotice error={problem} /> : null}

        {saved ? <Callout tone="info">{saved} enregistrée.</Callout> : null}

        <div className="overflow-hidden rounded-md border border-line bg-surface">
          {state.status === "idle" || state.status === "reading" ? (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-ink-3">
              <StatusDot shape="breathing" size={11} />
              lecture des clés que le serveur garde…
            </p>
          ) : null}

          {state.status === "read" && secrets.length === 0 ? (
            <EmptyState
              detail="Aucun module installé n'en réclame."
              icon={KeyRound}
              title="Ce serveur ne garde aucune clé"
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
