import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ServerReach } from "@shared/servers";

/**
 * What the address answered, told by a shape.
 *
 * A full dot for an SSH server that introduced itself, a struck one for an
 * address that refused, stayed silent, or answered something else. The failure
 * carries the main process's own words and its remedy, unchanged.
 */
export function ServerReachNotice({ reach }: { reach: ServerReach }) {
  const t = useTranslations();

  if (reach.reached) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-sm border border-line bg-base px-3 py-2.5"
        data-reach="ok"
      >
        <span className="mt-0.5">
          <StatusDot shape="filled" size={11} tone="ok" />
        </span>
        <div className="min-w-0">
          <p className="text-ink">
            {t("servers.add.reached", {
              ms: reach.ms,
              software: reach.software,
            })}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3 leading-relaxed">
            {t("servers.add.reachedHelp")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2.5 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2.5"
      data-reach={reach.code}
    >
      <span className="mt-0.5">
        <StatusDot shape="struck" size={11} tone="danger" />
      </span>
      <div className="min-w-0">
        <p className="text-ink">
          {t(reach.phrase.id as never, reach.phrase.values)}
        </p>
        <p className="mt-0.5 font-data text-[12px] text-ink-3 leading-relaxed">
          {t(`${reach.phrase.id}.fix` as never, reach.phrase.values)}
        </p>
      </div>
    </div>
  );
}
