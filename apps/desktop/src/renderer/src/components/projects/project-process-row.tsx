import type { Process } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory, uptime } from "@renderer/lib/format";
import { isRunning, PROCESS_LOOK } from "@renderer/lib/project-state";
import type { Gesture } from "@renderer/lib/use-pending";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { Play, RotateCw, Square } from "lucide-react";

const HEAVY_MB = 2048;

export function ProjectProcessRow({
  process,
  busy,
  onAct,
}: {
  process: Process;
  busy: boolean;
  onAct: Gesture<[ProjectAction, string]>;
}) {
  const t = useTranslations();

  const running = isRunning(process.state);

  return (
    <li
      className="flex flex-col gap-3 px-4 py-4"
      data-process={process.id}
      data-state={process.state}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-data font-semibold text-control text-ink">
          {process.id}
        </span>
        <StatePill look={PROCESS_LOOK[process.state]} name={process.state} />
        <span className="font-data text-ink-3 text-small tabular-nums">
          {process.host}:{process.port}
          {process.dir === "." ? "" : ` · ${process.dir}`}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Button
            disabled={busy}
            icon={running ? RotateCw : Play}
            onClick={() =>
              onAct(running ? "project.restart" : "project.up", process.id)
            }
            size="sm"
          >
            {running ? t("project.header.restart") : t("project.header.start")}
          </Button>
          {running ? (
            <Button
              disabled={busy}
              icon={Square}
              onClick={() => onAct("project.down", process.id)}
              size="sm"
            >
              {t("project.header.stop")}
            </Button>
          ) : null}
        </span>
      </div>

      <FactList>
        <Fact label={t("project.overview.startCmd")}>{process.cmd}</Fact>
        <Fact label={t("project.overview.installCmd")}>
          {process.install ||
            t("project.overview.derivedFrom", { pkgmgr: process.pkgmgr })}
        </Fact>
      </FactList>

      <p className="font-data text-ink-3 text-small tabular-nums">
        {uptime(process.uptime_s)}
        {process.pid ? ` · pid ${process.pid}` : ""}
        {process.ram_mb ? (
          <span className={(process.ram_mb ?? 0) > HEAVY_MB ? "text-warn" : ""}>
            {` · ${memory(process.ram_mb)}`}
          </span>
        ) : null}
      </p>
    </li>
  );
}
