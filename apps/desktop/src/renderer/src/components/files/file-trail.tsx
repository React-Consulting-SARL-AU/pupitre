import { ChevronRight } from "lucide-react";

const CRUMB =
  "clickable rounded-sm px-1.5 py-1 transition-fast hover:bg-raised hover:text-ink";

export function FileTrail({
  crumbs,
  rootLabel,
  label,
  onBrowse,
}: {
  crumbs: readonly string[];
  rootLabel: string;
  label: string;
  onBrowse: (path: string) => void;
}) {
  const last = crumbs.length - 1;

  return (
    <nav
      aria-label={label}
      className="flex min-w-0 flex-wrap items-center gap-0.5 text-small"
    >
      <button
        aria-current={last < 0 ? "location" : undefined}
        className={`${CRUMB} ${last < 0 ? "font-medium text-ink" : "text-ink-2"}`}
        onClick={() => onBrowse("")}
        type="button"
      >
        {rootLabel}
      </button>

      {crumbs.map((crumb, index) => (
        <span className="flex items-center gap-0.5" key={crumb + String(index)}>
          <ChevronRight
            aria-hidden="true"
            className="text-ink-4"
            size={12}
            strokeWidth={1.5}
          />
          <button
            aria-current={index === last ? "location" : undefined}
            className={`${CRUMB} font-data ${index === last ? "font-medium text-ink" : "text-ink-2"}`}
            onClick={() => onBrowse(crumbs.slice(0, index + 1).join("/"))}
            type="button"
          >
            {crumb}
          </button>
        </span>
      ))}
    </nav>
  );
}
