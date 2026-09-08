import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server } from "@shared/servers";
import { ArrowRight } from "lucide-react";

/**
 * A machine already known, offered for the picking rather than for management.
 *
 * The settings row can rename, show a key, delete: none of that belongs here,
 * because at this step there is only one thing to do with these machines, and
 * that is take one. The whole card is the button, so there is nowhere to hunt
 * for the click.
 */
export function OnboardingServerChoice({
  server,
  onPick,
}: {
  server: Server;
  onPick: () => void;
}) {
  const t = useTranslations();

  const address =
    server.origin === "system"
      ? server.host
      : `${server.user}@${server.host}:${server.port}`;

  return (
    <button
      className="elevation-raised clickable flex w-full items-center gap-3 rounded-md border border-line bg-surface p-4 text-left transition-soft hover:border-line-strong hover:bg-raised"
      data-server={server.id}
      onClick={onPick}
      type="button"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{server.name}</p>
        <p className="mt-0.5 break-all font-data text-[12px] text-ink-3">
          {address} · {t(originLabel(server))}
        </p>
      </div>

      <ArrowRight className="shrink-0 text-ink-3" size={14} strokeWidth={1.5} />
    </button>
  );
}

function originLabel(server: Server): DictionaryKey {
  if (server.grant?.adopted) {
    return "servers.row.configGranted";
  }

  return server.origin === "app"
    ? "servers.row.configApp"
    : "servers.row.configSystem";
}
