import type { ButtonIcon, ButtonVariant } from "./button";
import { StatusDot } from "./status-dot";

const VARIANT: Record<ButtonVariant, string> = {
  default:
    "border border-line text-ink-3 hover:border-line-strong hover:text-ink",
  inverse: "border border-inverse bg-inverse text-inverse-ink hover:bg-ink-2",
  discreet:
    "border border-transparent text-ink-4 hover:bg-raised hover:text-ink",
  danger: "border border-line text-ink-4 hover:border-danger hover:text-danger",
  destructive: "border border-danger bg-danger text-base hover:bg-danger/80",
};

/**
 * A square button whose label lives in its tooltip.
 *
 * The tooltip is the platform's own: these buttons sit inside scrolling panels
 * where a positioned bubble would be clipped by the first `overflow-hidden`
 * above it.
 */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = "default",
  loading = false,
  disabled = false,
  size = 13,
  className = "",
}: {
  icon: ButtonIcon;
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button
      aria-busy={loading}
      aria-label={label}
      className={`clickable inline-flex shrink-0 items-center justify-center rounded-sm p-1.5 transition-soft disabled:opacity-40 ${VARIANT[variant]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      title={label}
      type="button"
    >
      {loading ? (
        <StatusDot shape="breathing" size={size} />
      ) : (
        <Icon size={size} strokeWidth={1.5} />
      )}
    </button>
  );
}
