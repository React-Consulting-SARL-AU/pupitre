import { Select as Base } from "@base-ui-components/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { controlClass, type FieldText } from "./field";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectGroup<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
}

/** What floats under a control — a list of choices, a menu — shares one frame. */
export const POPUP_CLASS =
  "elevation-overlay z-50 rounded-md border border-line bg-surface p-1 outline-none transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

export const POPUP_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink";

export const POPUP_GROUP_LABEL_CLASS = "label px-2.5 pt-2 pb-1 text-ink-3";

function SelectItems<T extends string>({
  options,
  kind,
}: {
  options: readonly SelectOption<T>[];
  kind: FieldText;
}) {
  return options.map((option) => (
    <Base.Item
      className={`${POPUP_ITEM_CLASS} ${kind === "data" ? "font-data text-[12px]" : ""}`}
      key={option.value}
      value={option.value}
    >
      <Base.ItemText className="min-w-0 flex-1 truncate">
        {option.label}
      </Base.ItemText>
      <Base.ItemIndicator className="flex shrink-0 text-ink">
        <Check size={13} strokeWidth={1.5} />
      </Base.ItemIndicator>
    </Base.Item>
  ));
}

/**
 * One value among the ones a list allows, drawn by the app rather than by the
 * platform.
 *
 * The control reads like every other field — same frame, same inks, same
 * refusal border — and the list opens under it in the frame every floating
 * thing of the app shares. What the reader sees is always a label, never a
 * value: the value is what the form keeps. Groups, when the list has them,
 * are captioned the way every menu of the app captions its groups.
 */
export function Select<T extends string>({
  value,
  onChange,
  options = [],
  groups = [],
  kind = "prose",
  wrong = false,
  disabled = false,
  placeholder,
  className = "",
  ...rest
}: {
  value: T;
  onChange: (next: T) => void;
  options?: readonly SelectOption<T>[];
  groups?: readonly SelectGroup<T>[];
  /** A name reads in the interface face; a version, a port, a code in the data face. */
  kind?: FieldText;
  /** The control is refused: it takes the border every refused field takes. */
  wrong?: boolean;
  disabled?: boolean;
  /** What the control says while no option stands. */
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  "aria-label"?: string;
}) {
  const { id, name, ...aria } = rest;

  const every = [...options, ...groups.flatMap((group) => group.options)];

  return (
    <Base.Root
      disabled={disabled}
      name={name}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next as T);
        }
      }}
      value={value}
    >
      <Base.Trigger
        className={`${controlClass(kind, wrong)} flex items-center justify-between gap-2 text-left data-[popup-open]:border-ink ${className}`}
        id={id}
        {...aria}
      >
        <Base.Value className="min-w-0 flex-1 truncate">
          {(selected: T | null) =>
            every.find((option) => option.value === selected)?.label ??
            placeholder ??
            ""
          }
        </Base.Value>
        <Base.Icon className="flex shrink-0 text-ink-3">
          <ChevronsUpDown size={13} strokeWidth={1.5} />
        </Base.Icon>
      </Base.Trigger>

      <Base.Portal>
        <Base.Positioner
          align="start"
          alignItemWithTrigger={false}
          className="z-50"
          sideOffset={4}
        >
          <Base.Popup
            className={`${POPUP_CLASS} max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto`}
          >
            <Base.List>
              <SelectItems kind={kind} options={options} />

              {groups.map((group) => (
                <Base.Group key={group.label}>
                  <Base.GroupLabel className={POPUP_GROUP_LABEL_CLASS}>
                    {group.label}
                  </Base.GroupLabel>
                  <SelectItems kind={kind} options={group.options} />
                </Base.Group>
              ))}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
