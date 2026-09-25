import { ipcMain } from "electron";
import { account } from "./account";

export function registerSignInCancel(): void {
  ipcMain.on("account:sign-in-cancel", () => account.cancelSignIn());
}
