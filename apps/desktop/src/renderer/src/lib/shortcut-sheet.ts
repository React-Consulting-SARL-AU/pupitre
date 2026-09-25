import { historyChord } from "./history-shortcuts";
import { paletteChordLabel } from "./palette";
import { agentChordLabel, projectChordLabel } from "./project-shortcuts";
import { chordLabel } from "./terminal-shortcuts";

export type ShortcutGroupName = "navigation" | "project" | "terminal" | "files";

export interface ShortcutLine {
  /** Dictionary key under `shortcuts.<group>.` */
  name: string;
  /** One chord, or the two ends of a range: `⌘⌥1` to `⌘⌥7`. */
  keys: string[];
}

export interface ShortcutGroup {
  name: ShortcutGroupName;
  shortcuts: ShortcutLine[];
}

/** Built from the labels the tooltips print, so the sheet never disagrees with a control. */
export function shortcutSheet(mac: boolean): ShortcutGroup[] {
  const cmd = mac ? "⌘" : "Ctrl+";
  const project = projectChordLabel(mac);
  const terminal = chordLabel(mac);

  return [
    {
      name: "navigation",
      shortcuts: [
        { keys: [paletteChordLabel(mac)], name: "palette" },
        { keys: [historyChord("back", mac)], name: "back" },
        { keys: [historyChord("forward", mac)], name: "forward" },
        { keys: [`${cmd},`], name: "preferences" },
        { keys: [`${cmd}/`], name: "sheet" },
      ],
    },
    {
      name: "project",
      shortcuts: [
        { keys: [`${cmd}T`], name: "shell" },
        { keys: [agentChordLabel(mac)], name: "agent" },
        { keys: [`${project}→`], name: "nextTab" },
        { keys: [`${project}←`], name: "previousTab" },
        { keys: [`${project}1`, `${project}7`], name: "tabByRank" },
      ],
    },
    {
      name: "terminal",
      shortcuts: [
        { keys: [`${terminal}T`], name: "new" },
        { keys: [`${terminal}W`], name: "close" },
        { keys: [`${terminal}]`], name: "next" },
        { keys: [`${terminal}[`], name: "previous" },
        { keys: [`${terminal}1`, `${terminal}9`], name: "byRank" },
        { keys: [`${terminal}F`], name: "search" },
        { keys: [`${terminal}K`], name: "clear" },
        { keys: [`${terminal}+`, `${terminal}-`], name: "zoom" },
        { keys: [`${terminal}0`], name: "zoomReset" },
        ...(mac
          ? []
          : [
              { keys: [`${terminal}C`], name: "copy" },
              { keys: [`${terminal}V`], name: "paste" },
            ]),
      ],
    },
    {
      name: "files",
      shortcuts: [
        { keys: [`${cmd}F`], name: "find" },
        { keys: [`${cmd}S`], name: "save" },
      ],
    },
  ];
}
