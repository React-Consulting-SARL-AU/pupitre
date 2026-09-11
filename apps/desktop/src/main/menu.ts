import type { MenuItemConstructorOptions } from "electron";
import { dialogTextIn } from "./dialogs";

/**
 * The application menu, reduced to what the window needs.
 *
 * The edit roles are what make copy and paste work in the fields and the
 * terminals; the developer tools only exist in a build that is not packaged,
 * because a packaged renderer has nothing a customer should inspect. The
 * labels written here follow the system's language, as the roles around them
 * do. What an item does is handed in: the menu names a gesture, the main
 * process performs it or relays it to the window, which confirms where a
 * confirmation is due.
 */
export interface MenuActions {
  preferences: () => void;
  newTerminal: () => void;
  goToProject: () => void;
  checkUpdates: () => void;
  signOut: () => void;
}

const NOTHING: MenuActions = {
  checkUpdates: () => undefined,
  goToProject: () => undefined,
  newTerminal: () => undefined,
  preferences: () => undefined,
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

  return [
    ...(platform === "darwin" ? [appMenu] : []),
    file,
    { role: "editMenu" },
    { label: text("viewMenu"), submenu: view },
    { role: "windowMenu" },
  ];
}
