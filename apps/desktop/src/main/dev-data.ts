import { app } from "electron";
import { DEVELOPMENT_NAME, developmentDataFolder } from "./dev-data-run";
import { HARNESSED } from "./foreground";

const folder = developmentDataFolder(
  app.getPath("appData"),
  app.isPackaged,
  HARNESSED
);

if (folder) {
  app.setName(DEVELOPMENT_NAME);
  app.setPath("userData", folder);
}
