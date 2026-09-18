import { Menu as Base } from "@base-ui-components/react/menu";
import type { ButtonIcon } from "./button";
import { Tooltip } from "./tooltip";

export interface MenuEntry<Id extends string> {
  id: Id;
  label: string;
  icon?: ButtonIcon;
}

/**
 * A square button that opens a list of choices instead of doing one thing.
 *
 * The button reads like an `IconButton`: the name lives in its bubble, and it
 * stays drawn as pressed while the list is open. The list closes on a choice,
 * on Escape, and on a click anywhere else.
 */
export function Menu<Id extends string>({
  icon: Icon,
  label,
  entries,
  onPick,
  size = 13,
}: {
  icon: ButtonIcon;
  label: string;
  entries: readonly MenuEntry<Id>[];
  onPick: (id: Id) => void;
  size?: number;
}) {
  return (
    <Base.Root>
      <Tooltip label={label}>
        <Base.Trigger
          aria-label={label}
          className="clickable inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent p-1.5 text-ink-4 transition-soft hover:bg-raised hover:text-ink data-[popup-open]:bg-raised data-[popup-open]:text-ink"
        >
          <Icon size={size} strokeWidth={1.5} />
        </Base.Trigger>
      </Tooltip>

      <Base.Portal>
        <Base.Positioner
          align="start"
          className="z-50"
          side="bottom"
          sideOffset={4}
        >
          <Base.Popup className="elevation-raised min-w-36 rounded-md border border-line bg-surface p-1 outline-none">
            {entries.map(({ id, label: name, icon: EntryIcon }) => (
              <Base.Item
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-ink-2 outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
                key={id}
                onClick={() => onPick(id)}
              >
                {EntryIcon ? (
                  <EntryIcon className="shrink-0" size={13} strokeWidth={1.5} />
                ) : null}
                {name}
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
