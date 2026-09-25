import { AgentDot } from "@renderer/components/ui/agent-dot";
import { KIND_ICONS } from "@renderer/components/ui/agent-icons";
import { fieldControlClass } from "@renderer/components/ui/field";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentState, Terminal as TerminalInfo } from "@shared/terminals";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MIDDLE_BUTTON = 1;

/**
 * One tab of a row of sessions.
 *
 * The dot says what the session is doing before the name does, and the mark
 * says what kind it is once the reader has renamed it; the close button shows
 * on the tab in front and on the one under the mouse, and a middle click
 * closes without looking for it. A double click, F2 or Enter opens the name.
 */
export function TerminalTab({
  session,
  active,
  state,
  chord,
  onActivate,
  onClose,
  onRename,
}: {
  session: TerminalInfo;
  active: boolean;
  state: AgentState | undefined;
  /** What the tooltip prints before the key of a shortcut. */
  chord: string;
  onActivate: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const t = useTranslations();

  const [renaming, setRenaming] = useState(false);
  const tab = useRef<HTMLButtonElement | null>(null);
  const backToTab = useRef(false);

  const Mark = KIND_ICONS[session.kind];

  useEffect(() => {
    if (!renaming && backToTab.current) {
      backToTab.current = false;
      tab.current?.focus();
    }
  }, [renaming]);

  function leaveRename(): void {
    backToTab.current = true;
    setRenaming(false);
  }

  if (renaming) {
    return (
      <input
        aria-label={t("terminals.renameLabel", { title: session.title })}
        autoFocus
        className={`w-36 ${fieldControlClass} py-0.5 text-small`}
        defaultValue={session.title}
        onBlur={(event) => {
          onRename(event.target.value);
          setRenaming(false);
        }}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onRename(event.currentTarget.value);
            leaveRename();
          }

          if (event.key === "Escape") {
            leaveRename();
          }
        }}
      />
    );
  }

  return (
    <div
      className={`group flex shrink-0 items-center gap-0.5 rounded-sm border pr-0.5 pl-2 transition-soft ${
        active
          ? "border-line-strong bg-sunken text-ink"
          : "border-transparent text-ink-3 hover:bg-raised hover:text-ink"
      }`}
      data-active={active}
      data-terminal-kind={session.kind}
      data-terminal-tab={session.id}
      role="presentation"
    >
      <Tooltip label={t("terminals.renameHint")}>
        <button
          aria-selected={active}
          className="flex max-w-[12rem] items-center gap-1.5 py-1 pr-1 text-small"
          onAuxClick={(event) => {
            if (event.button === MIDDLE_BUTTON) {
              onClose();
            }
          }}
          onClick={onActivate}
          onDoubleClick={() => setRenaming(true)}
          onKeyDown={(event) => {
            if (event.key === "F2" || event.key === "Enter") {
              event.preventDefault();
              setRenaming(true);
            }
          }}
          ref={tab}
          role="tab"
          tabIndex={active ? 0 : -1}
          type="button"
        >
          <AgentDot state={state} />
          <Mark className="shrink-0 text-ink-3" size={11} strokeWidth={1.5} />
          <span className="truncate">{session.title}</span>
        </button>
      </Tooltip>

      {/* A pointer's shortcut only: the keyboard and the reader close from the bar's own button. */}
      <Tooltip label={t("terminals.closeTabHint", { chord })}>
        <button
          aria-hidden="true"
          className={`clickable inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-ink-4 transition-soft hover:bg-raised hover:text-ink ${
            active ? "" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={onClose}
          tabIndex={-1}
          type="button"
        >
          <X size={11} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  );
}
