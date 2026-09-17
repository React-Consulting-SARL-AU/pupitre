import { app } from "electron";
import { DEVELOPMENT_NAME, developmentDataFolder } from "./dev-data-run";
import { HARNESSED } from "./harness";
import { platformUrl } from "./platform-url";

const folder = developmentDataFolder(
  app.getPath("appData"),
  app.isPackaged,
  HARNESSED,
  platformUrl()
);

if (folder) {
  app.setName(DEVELOPMENT_NAME);
  app.setPath("userData", folder);
}
