import { Tooltip as Base } from "@base-ui-components/react/tooltip";
import type { ReactElement, ReactNode } from "react";

const OPEN_DELAY_MS = 150;
const GROUP_TIMEOUT_MS = 500;

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Base.Provider delay={OPEN_DELAY_MS} timeout={GROUP_TIMEOUT_MS}>
      {children}
    </Base.Provider>
  );
}

// Electron on macOS no longer shows native `title` bubbles since Chromium 140 (electron/electron issue 49843).
export function Tooltip({
  label,
  children,
}: {
  label: string;
  /** Must take a ref and spread the props it receives. */
  children: ReactElement<Record<string, unknown>>;
}) {
  return (
    <Base.Root>
      <Base.Trigger data-tooltip={label} render={children} />

      <Base.Portal>
        <Base.Positioner className="z-50" side="bottom" sideOffset={6}>
          <Base.Popup className="elevation-overlay max-w-xs rounded-sm border border-line bg-surface px-2 py-1 text-ink-2 text-small leading-snug transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {label}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
