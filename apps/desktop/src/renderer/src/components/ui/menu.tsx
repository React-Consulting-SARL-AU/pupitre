import { Menu as Base } from "@base-ui-components/react/menu";
import { ChevronDown } from "lucide-react";
import { type ButtonIcon, buttonClass } from "./button";
import { Tooltip } from "./tooltip";

export interface MenuEntry<Id extends string> {
  id: Id;
  label: string;
  detail?: string;
  icon?: ButtonIcon;
}

const ICON_TRIGGER =
  "clickable inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent p-1.5 text-ink-4 transition-soft hover:bg-raised hover:text-ink data-[popup-open]:bg-raised data-[popup-open]:text-ink";

export function Menu<Id extends string>({
  icon: Icon,
  label,
  entries,
  onPick,
  size = 13,
  trigger = "icon",
  ...data
}: {
  icon: ButtonIcon;
  label: string;
  entries: readonly MenuEntry<Id>[];
  onPick: (id: Id) => void;
  size?: number;
  /** `button` shows the label beside the icon, like a small `Button`, and needs no bubble. */
  trigger?: "icon" | "button";
} & Record<`data-${string}`, string>) {
  const shown =
    trigger === "button" ? (
      <Base.Trigger
        className={`${buttonClass("default", "sm")} data-[popup-open]:bg-raised`}
        {...data}
      >
        <Icon size={13} strokeWidth={1.5} />
        {label}
        <ChevronDown className="-mr-1 text-ink-3" size={12} strokeWidth={1.5} />
      </Base.Trigger>
    ) : (
      <Tooltip label={label}>
        <Base.Trigger aria-label={label} className={ICON_TRIGGER} {...data}>
          <Icon size={size} strokeWidth={1.5} />
        </Base.Trigger>
      </Tooltip>
    );

  return (
    <Base.Root>
      {shown}

      <Base.Portal>
        <Base.Positioner
          align="start"
          className="z-50"
          side="bottom"
          sideOffset={4}
        >
          <Base.Popup className="elevation-raised min-w-36 rounded-md border border-line bg-surface p-1 outline-none">
            {entries.map(({ id, label: name, detail, icon: EntryIcon }) => (
              <Base.Item
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-control text-ink-2 outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
                key={id}
                onClick={() => onPick(id)}
              >
                {EntryIcon ? (
                  <EntryIcon className="shrink-0" size={13} strokeWidth={1.5} />
                ) : null}
                {detail ? (
                  <>
                    <span className="w-16 shrink-0 truncate font-data text-caption text-ink-4 uppercase">
                      {name}
                    </span>
                    <span className="min-w-0 truncate font-data">{detail}</span>
                  </>
                ) : (
                  name
                )}
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
