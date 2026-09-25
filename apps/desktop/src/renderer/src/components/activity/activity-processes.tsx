import type { Process } from "@pupitre/shared/agent-protocol/processes";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory } from "@renderer/lib/format";
import type { AgentError } from "@shared/agent";
import { OctagonX, X } from "lucide-react";
import type { ReactNode } from "react";

const BUSY_CPU = 50;

const HEAVY_MB = 2048;

export function ActivityProcesses({
  processes,
  lingering = [],
  problem = null,
  onStop,
  onRetry,
}: {
  processes: readonly Process[];
  /** Pids still listed by the read that followed their stop: their button forces. */
  lingering?: readonly number[];
  /** The rows stay those of the last successful read. */
  problem?: AgentError | null;
  onStop: (pid: number, force: boolean) => void;
  onRetry?: () => void;
}) {
  const t = useTranslations();

  const peak = Math.max(...processes.map((p) => p.cpu), 1);

  let body: ReactNode;

  if (problem) {
    body = (
      <div data-processes="failed">
        <ErrorNotice error={problem} onRetry={onRetry} />
      </div>
    );
  } else if (processes.length === 0) {
    body = (
      <Panel inset="none">
        <EmptyState title={t("activity.processes.empty")} />
      </Panel>
    );
  } else {
    body = (
      <Panel list>
        {processes.map((process) => (
          <div className="flex items-center gap-3 px-4 py-3" key={process.pid}>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium text-control">
                  {process.command}
                </span>
                {process.project ? (
                  <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-0.5 font-data text-caption text-ink-2">
                    {process.project}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-sunken">
                <div
                  className="h-full rounded-full bg-ink-3 transition-size"
                  style={{
                    width: `${Math.max(2, (process.cpu / peak) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="shrink-0 text-right font-data text-small tabular-nums">
              <div
                className={process.cpu > BUSY_CPU ? "text-warn" : "text-ink-2"}
              >
                {process.cpu.toFixed(0)} %
              </div>
              <div
                className={
                  process.ram_mb > HEAVY_MB ? "text-warn" : "text-ink-3"
                }
              >
                {memory(process.ram_mb)}
              </div>
            </div>

            {lingering.includes(process.pid) ? (
              <ConfirmButton
                confirmLabel={t("activity.force")}
                icon={OctagonX}
                onConfirm={() => onStop(process.pid, true)}
                question={t("activity.process.forceQuestion", {
                  command: process.command,
                  pid: process.pid,
                })}
                size="sm"
              >
                {t("activity.force")}
              </ConfirmButton>
            ) : (
              <ConfirmButton
                confirmLabel={t("activity.stop")}
                icon={X}
                onConfirm={() => onStop(process.pid, false)}
                question={t("activity.process.question", {
                  command: process.command,
                  pid: process.pid,
                })}
                size="sm"
              >
                {t("activity.stop")}
              </ConfirmButton>
            )}
          </div>
        ))}
      </Panel>
    );
  }

  return (
    <Section name="processes" title={t("activity.weighs")}>
      {body}
    </Section>
  );
}
