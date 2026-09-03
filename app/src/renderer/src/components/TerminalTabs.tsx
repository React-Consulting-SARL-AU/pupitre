import type {
  AgentState,
  TerminalKind,
  Terminal as TerminalInfo,
} from "@shared/contract";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentDot } from "./AgentDot";
import { Terminal } from "./Terminal";

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
  sessions: TerminalInfo[];
  active: string | null;
  states: Record<string, AgentState>;
  kind: TerminalKind;
  project: string | null;
  onActivate: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
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
              className="w-32 rounded-md border border-accent bg-base px-2 py-1 text-[11px] outline-none"
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
              // biome-ignore lint/a11y/noAutofocus: the field was just opened by a double-click
              autoFocus
              ref={field}
            />
          ) : (
            <div
              className={`transition-soft group flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                session.id === active
                  ? "border-line-strong bg-sunken text-ink"
                  : "border-transparent text-ink-4 hover:text-ink-2"
              }`}
              key={session.id}
            >
              <button
                className="flex max-w-[11rem] items-center gap-1.5"
                onClick={() => onActivate(session.id)}
                onDoubleClick={() => setRenaming(session.id)}
                title="Double-click to rename"
                type="button"
              >
                <AgentDot state={states[session.id]} />
                <span className="truncate">{session.title}</span>
              </button>
              <button
                aria-label={`Close ${session.title}`}
                className="shrink-0 rounded text-ink-4 opacity-0 hover:text-danger group-hover:opacity-100"
                onClick={() => onClose(session.id)}
                type="button"
              >
                <X size={11} />
              </button>
            </div>
          )
        )}

        <button
          aria-label="New session"
          className="transition-soft shrink-0 rounded-md p-1 text-ink-4 hover:bg-sunken hover:text-accent-strong"
          onClick={onNew}
          type="button"
        >
          <Plus size={13} />
        </button>
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
            <Terminal id={session.id} kind={kind} project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}
