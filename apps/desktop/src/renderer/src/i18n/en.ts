import { account } from "./strings/account";
import { activity } from "./strings/activity";
import { app } from "./strings/app";
import { catalog } from "./strings/catalog";
import { common } from "./strings/common";
import { config } from "./strings/config";
import { dashboard } from "./strings/dashboard";
import { firstProject } from "./strings/first-project";
import { fleet } from "./strings/fleet";
import { format } from "./strings/format";
import { install } from "./strings/install";
import { onboarding } from "./strings/onboarding";
import { project } from "./strings/project";
import { secrets } from "./strings/secrets";
import { servers } from "./strings/servers";
import { services } from "./strings/services";
import { settings } from "./strings/settings";
import { shell } from "./strings/shell";
import { shots } from "./strings/shots";
import { state } from "./strings/state";
import { terminals } from "./strings/terminals";
import { ui } from "./strings/ui";
import { updates } from "./strings/updates";

export const en = {
  ...common.en,
  ...format.en,
  ...state.en,
  ...app.en,
  ...account.en,
  ...activity.en,
  ...catalog.en,
  ...config.en,
  ...dashboard.en,
  ...firstProject.en,
  ...fleet.en,
  ...install.en,
  ...onboarding.en,
  ...project.en,
  ...secrets.en,
  ...servers.en,
  ...services.en,
  ...settings.en,
  ...shell.en,
  ...shots.en,
  ...terminals.en,
  ...ui.en,
  ...updates.en,
};

export type DictionaryKey = keyof typeof en;

export type Dictionary = Record<DictionaryKey, string>;
