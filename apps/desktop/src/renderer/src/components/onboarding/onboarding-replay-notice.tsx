import { Callout } from "../ui/callout";

/**
 * Why a replay stops here instead of running.
 *
 * The vault was emptied the moment the secrets left for the server, so the app
 * has nothing left to send. Saying it plainly is the point: a module reinstalled
 * with an empty password would look like a success.
 */
export function OnboardingReplayNotice({ moduleName }: { moduleName: string }) {
  return (
    <Callout tone="info">
      {moduleName} portait un secret. L'app ne l'a pas gardé : il est parti sur
      le flux secret au moment de l'installation, puis oublié. Saisis-le à
      nouveau, ou fais-en générer un, avant de rejouer le module.
    </Callout>
  );
}
