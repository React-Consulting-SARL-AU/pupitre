import { Dialog as Base } from "@base-ui-components/react/dialog";
import type { ReactNode, RefObject } from "react";

/** The veil, the frame and the heading every dialog of the app shares, alert or not. */
export const DIALOG_BACKDROP =
  "fixed inset-0 bg-base/60 transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

export const DIALOG_POPUP =
  "elevation-overlay fixed top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-lg border border-line bg-surface p-6 outline-none transition-pop data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]";

export const DIALOG_TITLE = "font-semibold text-[15px] text-ink";

const WIDTH = {
  narrow: "w-[min(28rem,calc(100vw-2rem))]",
  wide: "w-[min(36rem,calc(100vw-2rem))]",
};

/**
 * A question that floats over the window and waits for one answer.
 *
 * The frame is the same for every dialog: a veil that closes it when clicked,
 * Escape that closes it too, the focus held inside and sent back where it was
 * once the answer is given. The title takes the focus first so a reader hears
 * the question before the controls — unless the caller names the one control
 * that should take it, a field to fill. What is asked and how it is answered
 * come from the caller.
 */
export function Dialog({
  open,
  name,
  title,
  onClose,
  focus,
  children,
  actions,
  width = "narrow",
}: {
  open: boolean;
  /** Names the dialog in a test and ties the heading to the frame. */
  name: string;
  title: string;
  onClose: () => void;
  /** The control that takes the focus on opening, when it is not the title. */
  focus?: RefObject<HTMLElement | null>;
  children: ReactNode;
  actions: ReactNode;
  /** `wide` for a dialog that holds a form rather than a sentence. */
  width?: keyof typeof WIDTH;
}) {
  return (
    <Base.Root
      onOpenChange={(next) => {
        if (!next) {
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

          {children}

          <div className="flex items-center justify-end gap-2">{actions}</div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
