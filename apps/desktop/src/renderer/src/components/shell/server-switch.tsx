import { Menu } from "@base-ui-components/react/menu";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Server } from "@shared/servers";
import { grantOpens, grantWithdrawn } from "@shared/servers";
import { ChevronsUpDown, Settings } from "lucide-react";
import { StatusDot, type StatusShape, type StatusTone } from "../ui/status-dot";

/**
 * The server card at the head of the sidebar, and the menu that switches it.
 *
 * Every server this computer knows is listed, the driven one marked, and each
 * carries the shape of its state: a filled dot for the one in front, a hollow
 * one for a server that can be opened, a struck one for a server the platform
 * has taken back. Switching used to be a thirteen-pixel dot three screens
 * away; here it is the card itself.
 */

const ITEM =
  "flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] text-ink outline-none data-[highlighted]:bg-raised";

function lookOf(
  server: Server,
  active: boolean
): { shape: StatusShape; tone: StatusTone } {
  if (active) {
    return { shape: "filled", tone: "ok" };
  }

  if (server.grant && grantWithdrawn(server.grant)) {
    return { shape: "struck", tone: "danger" };
  }

  if (server.grant && !grantOpens(server.grant)) {
    return { shape: "ringed", tone: "neutral" };
  }

  return { shape: "empty", tone: "neutral" };
}

export function ServerSwitch({
  server,
  servers,
  onActivate,
  onSettings,
}: {
  server: Server | null;
  servers: readonly Server[];
  onActivate: (id: string) => void;
  onSettings: () => void;
}) {
  const t = useTranslations();

  const label = server
    ? t("shell.switch.label", { name: server.name })
    : t("shell.sidebar.noServer");

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={label}
        className="clickable mx-2 mb-1 flex items-center gap-2.5 rounded-md border border-line bg-base px-2.5 py-2 text-left transition-soft hover:border-line-strong hover:bg-raised data-[popup-open]:border-line-strong data-[popup-open]:bg-raised"
        data-server-switch={server?.id ?? ""}
        title={label}
      >
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-medium text-[13px]">
            {server?.name ?? t("shell.sidebar.noServer")}
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-ink-3">
            <span className="shrink-0 font-data">{server?.host ?? "—"}</span>
            {server?.grant?.organization ? (
              <>
                <span aria-hidden="true" className="shrink-0 text-ink-4">
                  ·
                </span>
                <span className="truncate">
                  {server.grant.organization.name}
                </span>
              </>
            ) : null}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="shrink-0 text-ink-4"
          size={13}
          strokeWidth={1.5}
        />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner align="start" side="bottom" sideOffset={4}>
          <Menu.Popup
            aria-label={t("shell.switch.menu")}
            className="elevation-overlay z-50 min-w-52 rounded-md border border-line bg-surface p-1 outline-none"
          >
            <Menu.Group>
              <Menu.GroupLabel className="px-2.5 pt-1.5 pb-1 font-medium text-[11.5px] text-ink-3 uppercase tracking-[0.08em]">
                {t("shell.switch.menu")}
              </Menu.GroupLabel>
              {servers.map((one) => {
                const active = one.id === server?.id;
                const look = lookOf(one, active);

                return (
                  <Menu.Item
                    aria-current={active ? "true" : undefined}
                    className={`${ITEM} ${active ? "font-medium" : ""}`}
                    data-switch-server={one.id}
                    disabled={active}
                    key={one.id}
                    onClick={() => onActivate(one.id)}
                  >
                    <StatusDot shape={look.shape} size={9} tone={look.tone} />
                    <span className="min-w-0 flex-1 truncate">{one.name}</span>
                    <span className="shrink-0 font-data text-[11px] text-ink-3">
                      {one.host}
                    </span>
                  </Menu.Item>
                );
              })}
            </Menu.Group>

            <Menu.Separator className="my-1 h-px bg-line" />

            <Menu.Item className={ITEM} onClick={onSettings}>
              <Settings
                aria-hidden="true"
                className="shrink-0 text-ink-3"
                size={13}
                strokeWidth={1.5}
              />
              {t("shell.switch.manage")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
