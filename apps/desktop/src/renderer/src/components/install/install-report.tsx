import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { ModuleProgress } from "../../stores/install";
import { Button } from "../ui/button";
import { StatusDot } from "../ui/status-dot";

/**
 * What the agent concluded, and what can still be done about it.
 *
 * `failed` and `warned` are its own lists, printed in its own order. A module
 * that failed gets the button that runs `install` again for it alone; the way
 * out stays open unless what failed was something the rest depends on.
 */
export function InstallReport({
  result,
  modules,
  blocking,
  nameOf,
  onReplay,
  onContinue,
  replaying,
}: {
  result: InstallResult;
  modules: readonly ModuleProgress[];
  /** Failed modules the catalogue calls mandatory: the ones that bar the way. */
  blocking: readonly string[];
  nameOf: (moduleId: string) => string;
  onReplay?: (moduleId: string) => void;
  onContinue?: () => void;
  replaying?: string | null;
}) {
  function replayOf(moduleId: string): string | undefined {
    return modules
      .find((module) => module.id === moduleId)
      ?.steps.find((step) => step.replay)?.replay;
  }

  return (
    <section className="flex flex-col gap-gutter">
      {result.failed.length > 0 ? (
        <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-danger/40 bg-surface">
          {result.failed.map((moduleId) => (
            <li
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-failed={moduleId}
              key={moduleId}
            >
              <StatusDot shape="struck" size={10} tone="danger" />
              <div className="min-w-0 flex-1">
                <p className="text-ink">{nameOf(moduleId)}</p>
                {replayOf(moduleId) ? (
                  <code className="mt-0.5 block break-all font-data text-[11px] text-ink-3">
                    {replayOf(moduleId)}
                  </code>
                ) : null}
              </div>
              <Button
                icon={RotateCcw}
                loading={replaying === moduleId}
                onClick={() => onReplay?.(moduleId)}
              >
                Rejouer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {result.warned.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {result.warned.map((moduleId) => (
            <li
              className="flex items-center gap-2 text-ink-2"
              data-warned={moduleId}
              key={moduleId}
            >
              <StatusDot shape="ringed" size={10} tone="warn" />
              <span>{nameOf(moduleId)} : installé, avec un avertissement.</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <code className="font-data text-[11px] text-ink-3">
          {result.report_path}
        </code>

        {blocking.length === 0 ? (
          <Button icon={ArrowRight} onClick={onContinue} variant="inverse">
            Continuer
          </Button>
        ) : (
          <p className="text-danger">
            {blocking.map(nameOf).join(", ")} : la suite en dépend.
          </p>
        )}
      </div>
    </section>
  );
}
