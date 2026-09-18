import { AgentDot } from "@renderer/components/ui/agent-dot";
import { KIND_ICONS } from "@renderer/components/ui/agent-icons";
import { fieldControlClass } from "@renderer/components/ui/field";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentState, Terminal as TerminalInfo } from "@shared/terminals";
import { X } from "lucide-react";
import { useState } from "react";

const MIDDLE_BUTTON = 1;

/**
 * One tab of a row of sessions.
 *
 * The dot says what the session is doing before the name does, and the mark
 * says what kind it is once the reader has renamed it; the close button shows
 * on the tab in front and on the one under the mouse, and a middle click
 * closes without looking for it. A double click opens the name.
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

  const Mark = KIND_ICONS[session.kind];

  if (renaming) {
    return (
      <input
        aria-label={t("terminals.renameLabel", { title: session.title })}
        autoFocus
        className={`w-36 ${fieldControlClass} py-0.5 text-[12px]`}
        defaultValue={session.title}
        onBlur={(event) => {
          onRename(event.target.value);
          setRenaming(false);
        }}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            setRenaming(false);
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
    >
      <Tooltip label={t("terminals.renameHint")}>
        <button
          aria-selected={active}
          className="flex max-w-[12rem] items-center gap-1.5 py-1 pr-1 text-[12px]"
          onAuxClick={(event) => {
            if (event.button === MIDDLE_BUTTON) {
              onClose();
            }
          }}
          onClick={onActivate}
          onDoubleClick={() => setRenaming(true)}
          role="tab"
          tabIndex={active ? 0 : -1}
          type="button"
        >
          <AgentDot state={state} />
          <Mark className="shrink-0 text-ink-3" size={11} strokeWidth={1.5} />
          <span className="truncate">{session.title}</span>
        </button>
      </Tooltip>

      <IconButton
        className={
          active
            ? ""
            : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        }
        icon={X}
        label={t("terminals.closeTabHint", { chord })}
        onClick={onClose}
        size={11}
        variant="discreet"
      />
    </div>
  );
}
