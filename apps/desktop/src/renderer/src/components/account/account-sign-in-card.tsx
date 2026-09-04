import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { CopyField } from "@renderer/components/ui/copy-field";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import type { SignInState } from "@renderer/stores/account";
import { LogIn, RotateCw } from "lucide-react";

/**
 * The device flow, as it is lived: a code to read, a browser that opens on it,
 * and a wait that says what it is waiting for. The code stays on screen until
 * someone approves it, because that is the one thing to type over there.
 */
export function AccountSignInCard({
  signIn,
  consoleUrl,
  onConnect,
  onOpenConsole,
}: {
  signIn: SignInState;
  consoleUrl: string;
  onConnect: () => void;
  onOpenConsole: () => void;
}) {
  if (signIn.status === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={LogIn} onClick={onConnect} variant="inverse">
          Se connecter
        </Button>
        <Button onClick={onOpenConsole} variant="discreet">
          Ouvrir la console
        </Button>
      </div>
    );
  }

  if (signIn.status === "failed") {
    return (
      <Callout
        action={
          <Button icon={RotateCw} onClick={onConnect} size="sm">
            Réessayer
          </Button>
        }
        fix={signIn.error.fix}
        tone="danger"
      >
        {signIn.error.message}
      </Callout>
    );
  }

  if (signIn.status === "starting") {
    return (
      <WaitingNotice
        detail="La plateforme prépare un code pour cet appareil."
        title="Demande de connexion"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <WaitingNotice
        detail={`Approuvez le code dans le navigateur, sur ${consoleUrl}.`}
        note="Cette fenêtre se met à jour dès que la console a confirmé."
        title="En attente de votre approbation"
      />

      <CopyField
        help="Ce code identifie cette demande. Il expire au bout de trente minutes."
        label="Code à confirmer"
        value={signIn.userCode}
      />

      <div>
        <Button onClick={onOpenConsole} variant="discreet">
          Rouvrir le navigateur
        </Button>
      </div>
    </div>
  );
}
