import type { HelpLink } from "@shared/help";
import type { MenuItemConstructorOptions } from "electron";
import { dialogTextIn } from "./dialogs";

export interface MenuActions {
  preferences: () => void;
  newTerminal: () => void;
  newAgent: () => void;
  goToProject: () => void;
  shortcuts: () => void;
  checkUpdates: () => void;
  signOut: () => void;
  help: (link: HelpLink) => void;
}

const NOTHING: MenuActions = {
  checkUpdates: () => undefined,
  goToProject: () => undefined,
  help: () => undefined,
  newAgent: () => undefined,
  newTerminal: () => undefined,
  preferences: () => undefined,
  shortcuts: () => undefined,
  signOut: () => undefined,
};

export function menuTemplate(
  platform: NodeJS.Platform,
  packaged: boolean,
  locale: string,
  actions: MenuActions = NOTHING
): MenuItemConstructorOptions[] {
  const text = (key: Parameters<typeof dialogTextIn>[1]) =>
    dialogTextIn(locale, key);

  const preferences: MenuItemConstructorOptions = {
    accelerator: "CmdOrCtrl+,",
    click: actions.preferences,
    id: "preferences",
    label: text("preferences"),
  };
  const checkUpdates: MenuItemConstructorOptions = {
    click: actions.checkUpdates,
    id: "check-updates",
    label: text("checkUpdates"),
  };
  const signOut: MenuItemConstructorOptions = {
    click: actions.signOut,
    id: "sign-out",
    label: text("signOut"),
  };

  const appMenu: MenuItemConstructorOptions = {
    role: "appMenu",
    submenu: [
      { role: "about" },
      checkUpdates,
      { type: "separator" },
      preferences,
      { type: "separator" },
      signOut,
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const file: MenuItemConstructorOptions = {
    role: "fileMenu",
    submenu: [
      {
        accelerator: "CmdOrCtrl+T",
        click: actions.newTerminal,
        id: "new-terminal",
        label: text("newTerminal"),
      },
      {
        accelerator: "CmdOrCtrl+Shift+T",
        click: actions.newAgent,
        id: "new-agent",
        label: text("newAgent"),
      },
      {
        accelerator: "CmdOrCtrl+K",
        click: actions.goToProject,
        id: "go-to-project",
        label: text("goToProject"),
      },
      { type: "separator" },
      ...(platform === "darwin"
        ? []
        : [
            preferences,
            checkUpdates,
            signOut,
            { type: "separator" } as MenuItemConstructorOptions,
          ]),
      { role: platform === "darwin" ? "close" : "quit" },
    ],
  };

  const view: MenuItemConstructorOptions[] = [
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];

  if (!packaged) {
    view.push(
      { type: "separator" },
      { role: "reload" },
      { role: "toggleDevTools" }
    );
  }

  const help: MenuItemConstructorOptions = {
    label: text("helpMenu"),
    role: "help",
    submenu: [
      {
        accelerator: "CmdOrCtrl+/",
        click: actions.shortcuts,
        id: "shortcuts",
        label: text("shortcuts"),
      },
      { type: "separator" },
      {
        click: () => actions.help("docs"),
        id: "help-docs",
        label: text("helpDocs"),
      },
      {
        click: () => actions.help("support"),
        id: "help-support",
        label: text("helpSupport"),
      },
      {
        click: () => actions.help("legal"),
        id: "help-legal",
        label: text("helpLegal"),
      },
    ],
  };

  return [
    ...(platform === "darwin" ? [appMenu] : []),
    file,
    // Without the edit roles, copy and paste stop working in fields and terminals.
    { role: "editMenu" },
    { label: text("viewMenu"), submenu: view },
    { role: "windowMenu" },
    help,
  ];
}
