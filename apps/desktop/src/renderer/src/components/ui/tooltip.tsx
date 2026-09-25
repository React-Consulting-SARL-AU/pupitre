import { Tooltip as Base } from "@base-ui-components/react/tooltip";
import type { ReactElement, ReactNode } from "react";

const OPEN_DELAY_MS = 150;
const GROUP_TIMEOUT_MS = 500;

/**
 * The delay every bubble shares: short, and skipped while the pointer walks
 * from one control to the next, so a row of icons reads without waiting.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Base.Provider delay={OPEN_DELAY_MS} timeout={GROUP_TIMEOUT_MS}>
      {children}
    </Base.Provider>
  );
}

/**
 * The bubble that names a control on hover and on focus.
 *
 * Electron on macOS stopped showing the platform's own `title` bubble with
 * Chromium 140 (electron/electron issue 49843), so the name is drawn by the app,
 * through a portal: it escapes the `overflow-hidden` panels the control sits
 * in. The child must take a ref and spread props, as every button here does.
 */
export function Tooltip({
  label,
  children,
}: {
  label: string;
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
