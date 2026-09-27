import { Collapsible } from "@base-ui-components/react/collapsible";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ChevronRight, Ellipsis } from "lucide-react";
import { type ReactNode, useState } from "react";

const REMEMBERED = "pupitre.sidebar.more";

function remembered(): boolean {
  try {
    return window.localStorage.getItem(REMEMBERED) === "open";
  } catch {
    return false;
  }
}

function remember(open: boolean): void {
  try {
    window.localStorage.setItem(REMEMBERED, open ? "open" : "closed");
  } catch {
    // Without storage the fold only lasts the session.
  }
}

/** The server's less-used pages, folded so the projects stay high; the one on screen keeps it open. */
export function SidebarMore({
  holdsActive,
  children,
}: {
  holdsActive: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();

  const [opened, setOpened] = useState(remembered);

  const open = opened || holdsActive;

  return (
    <Collapsible.Root
      className="group/more flex flex-col gap-0.5"
      onOpenChange={(next) => {
        setOpened(next);
        remember(next);
      }}
      open={open}
    >
      <Collapsible.Trigger
        className="flex w-full items-center gap-2.5 rounded-sm py-2 pr-1.5 pl-3 text-left text-control text-ink-3 transition-soft hover:bg-sunken hover:text-ink"
        data-sidebar-more=""
      >
        <Ellipsis size={14} strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">
          {t("shell.sidebar.more")}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="text-ink-4 transition-soft group-data-[open]/more:rotate-90"
          size={13}
          strokeWidth={1.5}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel className="flex flex-col gap-0.5">
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
