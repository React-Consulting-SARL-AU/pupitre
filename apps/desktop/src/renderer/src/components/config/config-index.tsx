import { useTranslations } from "@renderer/i18n/use-translations";
import type {
  FieldGroup,
  FieldProblemView,
} from "@renderer/lib/catalog-selection";
import { StatusDot } from "../ui/status-dot";

export function ConfigIndex({
  groups,
  current,
  problems,
  shown,
  onPick,
}: {
  groups: readonly FieldGroup[];
  current: string | null;
  problems: readonly FieldProblemView[];
  shown: readonly FieldProblemView[];
  onPick?: (moduleId: string) => void;
}) {
  const t = useTranslations();

  // Completeness counts every problem; a strike only counts problems already shown.
  const left = new Set(problems.map((one) => one.module));
  const refused = new Set(shown.map((one) => one.module));

  return (
    <nav
      aria-label={t("config.index.label")}
      className="flex gap-0.5 overflow-x-auto lg:flex-col"
    >
      {groups.map((group) => {
        const wrong = refused.has(group.module.id);
        const done = !left.has(group.module.id);
        const open = group.module.id === current;

        let shape: "filled" | "struck" | "empty" = "empty";

        if (wrong) {
          shape = "struck";
        } else if (done) {
          shape = "filled";
        }

        return (
          <button
            aria-current={open ? "true" : undefined}
            className={`clickable flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-small transition-fast hover:bg-raised hover:text-ink ${
              open ? "bg-raised font-medium text-ink" : "text-ink-3"
            }`}
            data-index={group.module.id}
            data-state={shape}
            key={group.module.id}
            onClick={() => onPick?.(group.module.id)}
            type="button"
          >
            <StatusDot
              shape={shape}
              size={9}
              tone={wrong ? "danger" : "neutral"}
            />
            <span className="min-w-0 truncate">{group.module.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
