import { Dialog as Base } from "@base-ui-components/react/dialog";
import type { ReactNode, RefObject } from "react";

export const DIALOG_BACKDROP =
  "fixed inset-0 bg-base/60 transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

export const DIALOG_POPUP =
  "elevation-overlay fixed top-1/2 left-1/2 flex max-h-[calc(100vh-4rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-lg border border-line bg-surface p-6 outline-none transition-pop data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]";

export const DIALOG_TITLE = "font-semibold text-heading text-ink";

const WIDTH = {
  narrow: "w-[min(28rem,calc(100vw-2rem))]",
  wide: "w-[min(36rem,calc(100vw-2rem))]",
  large: "w-[min(56rem,calc(100vw-2rem))]",
};

export function Dialog({
  open,
  name,
  title,
  onClose,
  focus,
  children,
  actions,
  width = "narrow",
  locked = false,
}: {
  open: boolean;
  name: string;
  title: string;
  onClose: () => void;
  /** Takes the focus on opening instead of the title, which screen readers announce first. */
  focus?: RefObject<HTMLElement | null>;
  children: ReactNode;
  actions: ReactNode;
  width?: keyof typeof WIDTH;
  /** Neither the veil nor Escape closes it, only its actions: for work that must not be interrupted. */
  locked?: boolean;
}) {
  return (
    <Base.Root
      onOpenChange={(next) => {
        if (!(next || locked)) {
          onClose();
        }
      }}
      open={open}
    >
      <Base.Portal>
        <Base.Backdrop className={DIALOG_BACKDROP} />
        <Base.Popup
          className={`${DIALOG_POPUP} ${WIDTH[width]}`}
          data-dialog={name}
          initialFocus={focus}
        >
          <Base.Title className={DIALOG_TITLE}>{title}</Base.Title>

          <div className="-mx-1 flex min-h-0 flex-col gap-5 overflow-y-auto px-1">
            {children}
          </div>

          <div className="flex items-center justify-end gap-2">{actions}</div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
