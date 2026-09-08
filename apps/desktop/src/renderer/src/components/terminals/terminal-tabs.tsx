import { AgentDot } from "@renderer/components/ui/agent-dot";
import { fieldControlClass } from "@renderer/components/ui/field";
import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type {
  AgentState,
  Terminal as TerminalInfo,
  TerminalKind,
} from "@shared/terminals";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TerminalPane } from "./terminal-pane";

/**
 * Several sessions of the same kind, side by side.
 *
 * None is unmounted when you move to the next: they are all rendered, and only
 * the active one gets opacity and events. A terminal hidden by `display:none`
 * would measure zero rows, and the session brought back to the front would draw
 * itself crooked.
 */
export function TerminalTabs({
  sessions,
  active,
  states,
  kind,
  project,
  onActivate,
  onNew,
  onClose,
  onRename,
}: {
  sessions: readonly TerminalInfo[];
  active: string | null;
  states: Record<string, AgentState>;
  kind: TerminalKind;
  project: string | null;
  onActivate: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const t = useTranslations();

  const [renaming, setRenaming] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    field.current?.select();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-line border-b px-3 py-1.5">
        {sessions.map((session) =>
          renaming === session.id ? (
            <input
              autoFocus
              className={`w-32 ${fieldControlClass}`}
              defaultValue={session.title}
              key={session.id}
              onBlur={(e) => {
                onRename(session.id, e.target.value);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setRenaming(null);
                }
              }}
              ref={field}
            />
          ) : (
            <div
              className={`group flex shrink-0 items-center gap-1 rounded-sm border px-2 py-1 text-[12px] transition-soft ${
                session.id === active
                  ? "border-line-strong bg-sunken text-ink"
                  : "border-transparent text-ink-3 hover:text-ink"
              }`}
              key={session.id}
            >
              <button
                className="flex max-w-[11rem] items-center gap-1.5"
                onClick={() => onActivate(session.id)}
                onDoubleClick={() => setRenaming(session.id)}
                title={t("terminals.renameHint")}
                type="button"
              >
                <AgentDot state={states[session.id]} />
                <span className="truncate">{session.title}</span>
              </button>
              <IconButton
                className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                icon={X}
                label={t("terminals.close", { title: session.title })}
                onClick={() => onClose(session.id)}
                size={11}
                variant="danger"
              />
            </div>
          )
        )}

        <IconButton
          icon={Plus}
          label={t("terminals.newSession")}
          onClick={onNew}
          variant="discreet"
        />
      </div>

      <div className="relative min-h-0 flex-1">
        {sessions.map((session) => (
          <div
            className="absolute inset-0"
            key={session.id}
            style={{
              opacity: session.id === active ? 1 : 0,
              pointerEvents: session.id === active ? "auto" : "none",
              zIndex: session.id === active ? 1 : 0,
            }}
          >
            <TerminalPane
              active={session.id === active}
              id={session.id}
              kind={kind}
              project={project}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
