import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import type { AgentError } from "@shared/agent";
import type { Server } from "@shared/servers";
import { RotateCw, Settings as SettingsIcon, Wrench } from "lucide-react";

/**
 * A server the app can name but not drive.
 *
 * Either it has no agent yet — the onboarding is what puts one there — or the
 * link itself is refusing. The screen does not decide which: it shows the
 * agent's own message and its remedy, and offers the two ways out.
 */
export function ServerUnreadyScreen({
  server,
  error,
  onInstall,
  onRetry,
  onSettings,
}: {
  server: Server | null;
  /** Absent while the first read is still in flight. */
  error: AgentError | null;
  onInstall: () => void;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const nothingYet = server === null;

  return (
    <div className="grid h-full place-items-center px-8">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <Label>Connexion</Label>
        </div>

        <h1 className="mt-3 font-semibold text-2xl text-ink tracking-tight">
          {nothingYet
            ? "Aucun serveur pour l'instant"
            : `${server.name} ne répond pas encore`}
        </h1>

        <p className="mt-2 text-ink-3 leading-relaxed">
          {nothingYet
            ? "L'app parle à votre serveur en SSH, avec une configuration et une clé qui lui sont propres. Votre ~/.ssh/config n'est jamais modifié."
            : "L'agent n'a pas répondu sur cette machine. S'il n'y est pas encore, l'installation le pose ; sinon, voici ce que la connexion a renvoyé."}
        </p>

        {error ? (
          <div className="elevation-raised mt-6 rounded-md border border-line bg-surface px-4 py-3">
            <p className="font-data text-[11px] text-ink-4">{error.code}</p>
            <p className="mt-1 text-ink">{error.message}</p>
            {error.fix ? (
              <code className="mt-2 block font-data text-[11px] text-ink-2">
                {error.fix}
              </code>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button icon={Wrench} onClick={onInstall} variant="inverse">
            {nothingYet ? "Ajouter un serveur" : "Installer l'agent"}
          </Button>
          {nothingYet ? null : (
            <Button icon={RotateCw} onClick={onRetry}>
              Réessayer
            </Button>
          )}
          <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
            Gérer les serveurs
          </Button>
        </div>
      </div>
    </div>
  );
}
