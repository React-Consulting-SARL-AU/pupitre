import type { Session } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory, uptime } from "@renderer/lib/format";
import { isAttached, reattachable } from "@renderer/lib/sessions";
import type { TerminalAgent } from "@shared/terminals";
import {
  Braces,
  PlugZap,
  Sparkles,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";

/**
 * What outlives whatever started it.
 *
 * An agent or a remote IDE backend keeps living when its terminal disappears —
 * app closed, IntelliJ window shut — and holds its memory for nobody. A
 * JetBrains backend alone weighs several gigabytes. An agent that still has a
 * project can be taken back: its tab reopens on the tmux session it runs in.
 */

const HEAVY_MB = 1024;

const HEAVY_TOTAL_MB = 2048;

const KINDS: Record<
  Session["kind"],
  { label: DictionaryKey; icon: typeof Braces }
> = {
  claude: { icon: Sparkles, label: "activity.kind.agent" },
  codex: { icon: Sparkles, label: "activity.kind.agent" },
  copilot: { icon: Sparkles, label: "activity.kind.agent" },
  cursor: { icon: Sparkles, label: "activity.kind.agent" },
  gemini: { icon: Sparkles, label: "activity.kind.agent" },
  hermes: { icon: Sparkles, label: "activity.kind.agent" },
  opencode: { icon: Sparkles, label: "activity.kind.agent" },
  ide: { icon: Braces, label: "activity.kind.ide" },
  shell: { icon: SquareTerminal, label: "activity.kind.shell" },
};

export function ActivitySessions({
  sessions,
  attached,
  onStop,
  onClean,
  onReattach,
}: {
  sessions: readonly Session[];
  /** The sessions the app still has a tab on: the others are the strays. */
  attached: readonly string[];
  onStop: (pid: number) => void;
  onClean: () => void;
  /** Opens a tab on the session's project and kind: the agent reattaches to it. */
  onReattach?: (project: string, kind: TerminalAgent) => void;
}) {
  const t = useTranslations();

  if (sessions.length === 0) {
    return <EmptyState title={t("activity.sessions.empty")} />;
  }

  const total = sessions.reduce((sum, session) => sum + session.ram_mb, 0);

  return (
    <div>
      <div className="flex items-center justify-between border-line border-b px-4 py-2.5">
        <span className="font-data text-[12px] text-ink-3">
          {t.plural("activity.session", sessions.length)} ·{" "}
          <span className={total > HEAVY_TOTAL_MB ? "text-warn" : ""}>
            {memory(total)}
          </span>
        </span>
        <ConfirmButton
          confirmLabel={t("activity.stop")}
          icon={Trash2}
          onConfirm={onClean}
          question={t("activity.clean.question")}
          size="sm"
        >
          {t("activity.clean.action")}
        </ConfirmButton>
      </div>

      <div className="divide-y divide-line">
        {[...sessions]
          .sort((a, b) => b.ram_mb - a.ram_mb)
          .map((session) => {
            const kind = KINDS[session.kind];
            const Icon = kind.icon;

            return (
              <div
                className="flex items-center gap-3 px-4 py-3"
                key={session.pid}
              >
                <Icon
                  className="shrink-0 text-ink-3"
                  size={14}
                  strokeWidth={1.5}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{session.command}</p>
                  <p className="font-data text-[11px] text-ink-3">
                    {t(kind.label)} · pid {session.pid} ·{" "}
                    {uptime(session.seconds)}
                    {session.project ? ` · ${session.project}` : ""}
                    {isAttached(attached, session)
                      ? ` · ${t("activity.session.tab")}`
                      : ""}
                  </p>
                </div>

                <span
                  className={`shrink-0 font-data text-[12px] tabular-nums ${
                    session.ram_mb > HEAVY_MB ? "text-warn" : "text-ink-3"
                  }`}
                >
                  {memory(session.ram_mb)}
                </span>

                {onReattach && reattachable(attached, session) ? (
                  <Button
                    hint={t("activity.session.reattachHint", {
                      project: session.project ?? "",
                    })}
                    icon={PlugZap}
                    onClick={() =>
                      onReattach(
                        session.project as string,
                        session.kind as TerminalAgent
                      )
                    }
                    size="sm"
                  >
                    {t("activity.session.reattach")}
                  </Button>
                ) : null}

                <ConfirmButton
                  confirmLabel={t("activity.stop")}
                  icon={X}
                  onConfirm={() => onStop(session.pid)}
                  question={t("activity.session.question", {
                    command: session.command,
                    pid: session.pid,
                  })}
                  size="sm"
                >
                  {t("activity.stop")}
                </ConfirmButton>
              </div>
            );
          })}
      </div>
    </div>
  );
}
