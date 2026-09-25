import { account } from "./account";
import { listen } from "./ipc";
import { shape } from "./ipc-guard";

export function registerSignInCancel(): void {
  listen("account:sign-in-cancel", shape(), () => account.cancelSignIn());
}
