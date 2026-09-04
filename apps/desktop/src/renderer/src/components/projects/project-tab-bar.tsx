import { AgentDot } from "@renderer/components/ui/agent-dot";
import {
  ClaudeIcon,
  CodexIcon,
  type IconComponent,
} from "@renderer/components/ui/agent-icons";
import { dominantState } from "@renderer/stores/navigation";
import type { AgentState, Terminal } from "@shared/terminals";
import {
  Bot,
  FileDiff,
  LayoutGrid,
  ScrollText,
  SquareTerminal,
} from "lucide-react";
import { type ProjectTab, TAB_LABEL } from "./project-tabs";

const ICONS: Record<ProjectTab, IconComponent> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
  diff: FileDiff,
  hermes: Bot,
  logs: ScrollText,
  overview: LayoutGrid,
  shell: SquareTerminal,
};

/**
 * One row of tabs, driven by a list rather than by a chain of conditions.
 *
 * The badge is whatever the tab has to say for itself — the number of changed
 * files, the number of open sessions — and the dot the state of the sessions
 * behind it.
 */
export function ProjectTabBar({
  tabs,
  active,
  onSelect,
  counts,
  sessions,
  states,
}: {
  tabs: readonly ProjectTab[];
  active: ProjectTab;
  onSelect: (tab: ProjectTab) => void;
  counts: Partial<Record<ProjectTab, number>>;
  sessions: Partial<Record<ProjectTab, readonly Terminal[]>>;
  states: Record<string, AgentState>;
}) {
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = ICONS[tab];
        const count = counts[tab] ?? 0;
        const open = sessions[tab] ?? [];

        return (
          <button
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-soft ${
              tab === active
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ink-3 hover:text-ink"
            }`}
            key={tab}
            onClick={() => onSelect(tab)}
            type="button"
          >
            <Icon size={13} strokeWidth={1.5} />
            {TAB_LABEL[tab]}
            {count > 0 ? (
              <span className="rounded-full bg-sunken px-1.5 font-data text-[10px] text-ink-3 tabular-nums">
                {count}
              </span>
            ) : null}
            <AgentDot state={dominantState(open, states)} />
          </button>
        );
      })}
    </div>
  );
}
