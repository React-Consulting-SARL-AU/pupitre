import { useTranslations } from "@renderer/i18n/use-translations";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

/**
 * A question that floats over the window and waits for one answer.
 *
 * The frame is the same for every dialog: a veil that closes it when clicked,
 * Escape that closes it too, and the title that takes the focus so a reader
 * hears the question before the controls — unless the caller names the one
 * control that should take it, a field to fill. What is asked and how it is
 * answered come from the caller.
 */
export function Dialog({
  open,
  name,
  title,
  onClose,
  focus,
  children,
  actions,
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
}) {
  const t = useTranslations();

  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    (focus?.current ?? heading.current)?.focus();

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onEscape);

    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onClose, focus]);

  if (!open) {
    return null;
  }

  const titleId = `${name}-title`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <button
        aria-label={t("common.cancel")}
        className="absolute inset-0 cursor-default bg-base/60"
        onClick={onClose}
        type="button"
      />

      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="elevation-overlay relative flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-5"
        data-dialog={name}
        role="dialog"
      >
        <h2
          className="font-semibold text-[15px] text-ink outline-none"
          id={titleId}
          ref={heading}
          tabIndex={-1}
        >
          {title}
        </h2>

        {children}

        <div className="flex items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
