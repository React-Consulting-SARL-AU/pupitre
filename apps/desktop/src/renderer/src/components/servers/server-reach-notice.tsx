import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ServerAccess, ServerReach } from "@shared/servers";

/**
 * What the address answered, told by a shape.
 *
 * A full dot for an SSH server that introduced itself and an account the app
 * will open, a hollow one for an account the app will not open by itself, a
 * struck one for an address that refused, stayed silent, or answered something
 * else. The failure carries the main process's own words and its remedy,
 * unchanged.
 */
export function ServerReachNotice({ reach }: { reach: ServerReach }) {
  const t = useTranslations();

  if (!reach.reached) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-sm bg-sunken px-3 py-2.5"
        data-reach={reach.code}
      >
        <span className="mt-0.5">
          <StatusDot shape="struck" size={11} tone="danger" />
        </span>
        <div className="min-w-0">
          <p className="text-ink">
            {t(reach.phrase.id as never, reach.phrase.values)}
          </p>
          <p className="mt-0.5 font-data text-ink-3 text-small leading-relaxed">
            {t(`${reach.phrase.id}.fix` as never, reach.phrase.values)}
          </p>
        </div>
      </div>
    );
  }

  const { access } = reach;
  const manual = access.access === "manual";

  return (
    <div
      className="flex items-start gap-2.5 rounded-sm bg-sunken px-3 py-2.5"
      data-access={access.access}
      data-reach="ok"
    >
      <span className="mt-0.5">
        <StatusDot
          shape={manual ? "empty" : "filled"}
          size={11}
          tone={manual ? "warn" : "ok"}
        />
      </span>
      <div className="min-w-0">
        <p className="text-ink">
          {t("servers.add.reached", { ms: reach.ms, software: reach.software })}
        </p>
        <p className="mt-0.5 text-ink-3 text-small leading-relaxed">
          {accessText(t, access)}
        </p>
        {manual ? (
          <p className="mt-0.5 text-ink-3 text-small leading-relaxed">
            {t("servers.add.access.manualHelp")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function accessText(
  t: ReturnType<typeof useTranslations>,
  access: ServerAccess
): string {
  switch (access.access) {
    case "opens":
      return t("servers.add.access.opens");
    case "password":
      return t("servers.add.access.password");
    default:
      return t(access.phrase.id as never, access.phrase.values);
  }
}
