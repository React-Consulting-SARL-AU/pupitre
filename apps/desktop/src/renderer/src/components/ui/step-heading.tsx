import { type ReactNode, useEffect, useRef } from "react";

/**
 * The title of a step, and where the focus lands when that step arrives.
 *
 * A panel that is replaced takes the focused button with it, and the focus
 * falls back to the document. Sending it here instead says where the reader has
 * arrived, and puts the tab order back at the top of the work rather than at
 * the end of a screen that has gone.
 */
export function StepHeading({
  eyebrow,
  title,
  description,
  /** Changes when the step does: that is what asks for the focus. */
  step,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  step: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <header className="flex flex-col gap-1" data-step-heading={step}>
      {eyebrow ? <span className="label text-ink-3">{eyebrow}</span> : null}

      <h1
        className="font-medium text-[20px] text-ink outline-none"
        ref={heading}
        tabIndex={-1}
      >
        {title}
      </h1>

      {description ? (
        <p className="text-ink-3 leading-relaxed">{description}</p>
      ) : null}
    </header>
  );
}
