import type { Dictionary } from "./en";
import { account } from "./strings/account";
import { activity } from "./strings/activity";
import { app } from "./strings/app";
import { catalog } from "./strings/catalog";
import { common } from "./strings/common";
import { config } from "./strings/config";
import { dashboard } from "./strings/dashboard";
import { firstProject } from "./strings/first-project";
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

export const fr: Dictionary = {
  ...common.fr,
  ...format.fr,
  ...state.fr,
  ...app.fr,
  ...account.fr,
  ...activity.fr,
  ...catalog.fr,
  ...config.fr,
  ...dashboard.fr,
  ...firstProject.fr,
  ...install.fr,
  ...onboarding.fr,
  ...project.fr,
  ...secrets.fr,
  ...servers.fr,
  ...services.fr,
  ...settings.fr,
  ...shell.fr,
  ...shots.fr,
  ...terminals.fr,
  ...ui.fr,
  ...updates.fr,
};
