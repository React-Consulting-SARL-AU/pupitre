import type { Dictionary } from "./en";
import { account } from "./strings/account";
import { activity } from "./strings/activity";
import { app } from "./strings/app";
import { backups } from "./strings/backups";
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
import { installSteps } from "./strings/install-steps";
import { keyApprovals } from "./strings/key-approvals";
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
import { sudo } from "./strings/sudo";
import { terminals } from "./strings/terminals";
import { transfers } from "./strings/transfers";
import { ui } from "./strings/ui";
import { updates } from "./strings/updates";

export const fr: Dictionary = {
  ...common.fr,
  ...refusals.fr,
  ...roles.fr,
  ...format.fr,
  ...forwards.fr,
  ...state.fr,
  ...app.fr,
  ...account.fr,
  ...activity.fr,
  ...backups.fr,
  ...catalog.fr,
  ...config.fr,
  ...connections.fr,
  ...dashboard.fr,
  ...files.fr,
  ...fleet.fr,
  ...help.fr,
  ...install.fr,
  ...installSteps.fr,
  ...keyApprovals.fr,
  ...onboarding.fr,
  ...project.fr,
  ...projectAdd.fr,
  ...projectConfig.fr,
  ...servers.fr,
  ...services.fr,
  ...settings.fr,
  ...shell.fr,
  ...shots.fr,
  ...sudo.fr,
  ...terminals.fr,
  ...transfers.fr,
  ...ui.fr,
  ...updates.fr,
};
