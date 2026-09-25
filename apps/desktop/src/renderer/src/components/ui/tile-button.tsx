import { type Gesture, usePending } from "@renderer/lib/use-pending";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Kbd } from "./kbd";
import { panelClass } from "./panel";
import { Spinner } from "./spinner";

/**
 * A gesture big enough to be the whole point of a panel.
 *
 * Where a `Button` sits on a line, a tile is a card: the mark of the thing it
 * starts, its name, what qualifies it, and the arrow that says it leads
 * somewhere. It waits on the promise of the gesture like any other control.
 */
export function TileButton({
  mark,
  children,
  detail,
  shortcut,
  onClick,
  className = "",
}: {
  /** What the thing looks like: a service logo, an icon. */
  mark: ReactNode;
  children: ReactNode;
  /** What the name leaves unsaid, under it. */
  detail?: string;
  /** The chord that presses this tile from the keyboard, drawn as a key cap. */
  shortcut?: string;
  onClick: Gesture;
  className?: string;
}) {
  const [click, pending] = usePending(onClick);

  return (
    <button
      aria-busy={pending}
      aria-keyshortcuts={shortcut}
      className={`${panelClass("none")} clickable group flex w-full items-center gap-4 px-5 py-4 text-left transition-soft hover:border-line-strong hover:bg-raised ${pending ? "cursor-progress" : ""} ${className}`}
      disabled={pending}
      onClick={click}
      type="button"
    >
      {mark}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-body text-ink">
          {children}
        </span>
        {detail ? (
          <span className="truncate font-data text-ink-3 text-small">
            {detail}
          </span>
        ) : null}
      </span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      {pending ? (
        <Spinner size={14} />
      ) : (
        <ArrowRight
          className="shrink-0 text-ink-3 opacity-0 transition-soft group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
          size={15}
          strokeWidth={1.5}
        />
      )}
    </button>
  );
}
