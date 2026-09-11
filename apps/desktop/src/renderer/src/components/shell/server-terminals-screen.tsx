import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentState, Terminal, TerminalKind } from "@shared/terminals";
import { Plus, SquareTerminal } from "lucide-react";
import { TerminalTabs } from "../terminals/terminal-tabs";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Screen } from "../ui/screen";

/**
 * The server's own terminals — the projects' ones live on their page.
 *
 * Sessions survive unmounting: it is the `lib/terminals` registry that holds
 * them, not React. With none open, the screen says so and offers the one
 * gesture that changes that.
 */
export function ServerTerminalsScreen({
  terminals,
  active,
  states,
  onActivate,
  onClose,
  onNew,
  onRename,
}: {
  terminals: Terminal[];
  active: string | null;
  states: Record<string, AgentState>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (project: string | null, kind: TerminalKind) => void;
  onRename: (id: string, title: string) => void;
}) {
  const t = useTranslations();

  return (
    <Screen
      eyebrow={t("app.terminals.eyebrow")}
      fill
      title={t("app.terminals.title")}
    >
      {terminals.length === 0 ? (
        <EmptyState
          action={
            <Button icon={Plus} onClick={() => onNew(null, "shell")}>
              {t("app.terminals.empty.action")}
            </Button>
          }
          detail={t("app.terminals.empty.detail")}
          icon={SquareTerminal}
          title={t("app.terminals.empty.title")}
        />
      ) : (
        <TerminalTabs
          active={active}
          kind="shell"
          onActivate={onActivate}
          onClose={onClose}
          onNew={() => onNew(null, "shell")}
          onRename={onRename}
          project={null}
          sessions={terminals}
          states={states}
        />
      )}
    </Screen>
  );
}
