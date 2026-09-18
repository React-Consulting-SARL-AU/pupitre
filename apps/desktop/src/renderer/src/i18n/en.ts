import { account } from "./strings/account";
import { activity } from "./strings/activity";
import { app } from "./strings/app";
import { catalog } from "./strings/catalog";
import { common } from "./strings/common";
import { config } from "./strings/config";
import { connections } from "./strings/connections";
import { dashboard } from "./strings/dashboard";
import { files } from "./strings/files";
import { fleet } from "./strings/fleet";
import { format } from "./strings/format";
import { forwards } from "./strings/forwards";
import { help } from "./strings/help";
import { install } from "./strings/install";
import { onboarding } from "./strings/onboarding";
import { project } from "./strings/project";
import { projectAdd } from "./strings/project-add";
import { projectConfig } from "./strings/project-config";
import { refusals } from "./strings/refusals";
import { roles } from "./strings/roles";
import { servers } from "./strings/servers";
import { services } from "./strings/services";
import { settings } from "./strings/settings";
import { shell } from "./strings/shell";
import { shots } from "./strings/shots";
import { state } from "./strings/state";
import { terminals } from "./strings/terminals";
import { transfers } from "./strings/transfers";
import { ui } from "./strings/ui";
import { updates } from "./strings/updates";

export const en = {
  ...common.en,
  ...refusals.en,
  ...roles.en,
  ...format.en,
  ...forwards.en,
  ...state.en,
  ...app.en,
  ...account.en,
  ...activity.en,
  ...catalog.en,
  ...config.en,
  ...connections.en,
  ...dashboard.en,
  ...files.en,
  ...fleet.en,
  ...help.en,
  ...install.en,
  ...onboarding.en,
  ...project.en,
  ...projectAdd.en,
  ...projectConfig.en,
  ...servers.en,
  ...services.en,
  ...settings.en,
  ...shell.en,
  ...shots.en,
  ...terminals.en,
  ...transfers.en,
  ...ui.en,
  ...updates.en,
};

export type DictionaryKey = keyof typeof en;

export type Dictionary = Record<DictionaryKey, string>;
