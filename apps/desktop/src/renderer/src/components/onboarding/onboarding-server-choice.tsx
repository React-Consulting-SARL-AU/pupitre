import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { type Gesture, usePending } from "@renderer/lib/use-pending";
import type { Server } from "@shared/servers";
import { ArrowRight } from "lucide-react";
import { Spinner } from "../ui/spinner";

export function OnboardingServerChoice({
  server,
  onPick,
}: {
  server: Server;
  onPick: Gesture;
}) {
  const t = useTranslations();

  const [pick, pending] = usePending(onPick);

  const address =
    server.origin === "system"
      ? server.host
      : `${server.user}@${server.host}:${server.port}`;

  return (
    <button
      aria-busy={pending}
      className={`elevation-raised clickable flex w-full items-center gap-3 rounded-md border border-line bg-surface p-4 text-left transition-soft hover:border-line-strong hover:bg-raised ${pending ? "cursor-progress" : ""}`}
      data-server={server.id}
      disabled={pending}
      onClick={pick}
      type="button"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{server.name}</p>
        <p className="mt-0.5 break-all font-data text-ink-3 text-small">
          {address} · {t(originLabel(server))}
        </p>
      </div>

      {pending ? (
        <Spinner size={14} />
      ) : (
        <ArrowRight
          className="shrink-0 text-ink-3"
          size={14}
          strokeWidth={1.5}
        />
      )}
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
