import { AgentDot } from "@renderer/components/ui/agent-dot";
import {
  ClaudeIcon,
  CodexIcon,
  CopilotIcon,
  CursorIcon,
  GeminiIcon,
  type IconComponent,
  OpencodeIcon,
} from "@renderer/components/ui/agent-icons";
import { TabBar, TabButton } from "@renderer/components/ui/tab-bar";
import { useTranslations } from "@renderer/i18n/use-translations";
import { dominantState } from "@renderer/stores/navigation";
import type { AgentState, Terminal } from "@shared/terminals";
import {
  Bot,
  FileDiff,
  Files,
  LayoutGrid,
  ScrollText,
  Settings2,
  SquareTerminal,
} from "lucide-react";
import { type ProjectTab, TAB_LABEL } from "./project-tabs";

const ICONS: Record<ProjectTab, IconComponent> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
  configuration: Settings2,
  copilot: CopilotIcon,
  cursor: CursorIcon,
  diff: FileDiff,
  files: Files,
  gemini: GeminiIcon,
  hermes: Bot,
  logs: ScrollText,
  opencode: OpencodeIcon,
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
  const t = useTranslations();

  return (
    <TabBar>
      {tabs.map((tab) => {
        const Icon = ICONS[tab];
        const count = counts[tab] ?? 0;
        const open = sessions[tab] ?? [];

        return (
          <TabButton
            active={tab === active}
            key={tab}
            onClick={() => onSelect(tab)}
          >
            <Icon size={13} strokeWidth={1.5} />
            {t(TAB_LABEL[tab])}
            {count > 0 ? (
              <span className="rounded-full bg-sunken px-1.5 font-data text-[11px] text-ink-3 tabular-nums">
                {count}
              </span>
            ) : null}
            <AgentDot state={dominantState(open, states)} />
          </TabButton>
        );
      })}
    </TabBar>
  );
}
