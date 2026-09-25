import { type Gesture, usePending } from "@renderer/lib/use-pending";
import type { ButtonIcon, ButtonVariant } from "./button";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

const VARIANT: Record<ButtonVariant, string> = {
  default:
    "border border-line text-ink-3 hover:border-line-strong hover:text-ink",
  inverse: "border border-inverse bg-inverse text-inverse-ink hover:bg-ink-2",
  discreet:
    "border border-transparent text-ink-4 hover:bg-raised hover:text-ink",
  danger: "border border-line text-ink-4 hover:border-danger hover:text-danger",
  destructive: "border border-danger bg-danger text-base hover:bg-danger/80",
};

const PRESSED = "border-inverse bg-inverse text-inverse-ink hover:bg-ink-2";

/** A square button whose label lives in its tooltip. */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = "default",
  loading = false,
  disabled = false,
  size = 13,
  className = "",
  expanded,
  pressed,
  asks = false,
}: {
  icon: ButtonIcon;
  label: string;
  /** Answer with the promise of the work started and the button waits on it. */
  onClick?: Gesture;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
  /** For a button that folds something: what it currently shows. */
  expanded?: boolean;
  /** For a button that switches something on: whether it is on, drawn filled. */
  pressed?: boolean;
  /** For a button that opens a dialog before it does anything. */
  asks?: boolean;
}) {
  const [click, pending] = usePending(onClick);

  const waiting = loading || pending;

  return (
    <Tooltip label={label}>
      <button
        aria-busy={waiting}
        aria-expanded={expanded}
        aria-haspopup={asks ? "dialog" : undefined}
        aria-label={label}
        aria-pressed={pressed}
        className={`clickable inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-sm p-1.5 transition-soft ${waiting ? "cursor-progress" : ""} ${disabled && !waiting ? "opacity-40" : ""} ${pressed ? PRESSED : VARIANT[variant]} ${className}`}
        disabled={disabled || waiting}
        onClick={click}
        type="button"
      >
        {waiting ? (
          <Spinner size={size} />
        ) : (
          <Icon size={size} strokeWidth={1.5} />
        )}
      </button>
    </Tooltip>
  );
}
