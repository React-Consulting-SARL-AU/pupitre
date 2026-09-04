import { WaitingNotice } from "../ui/waiting-notice";

/**
 * The one wait the agent cannot narrate, because it is not on the machine yet.
 */
export function InstallSending({ arch }: { arch: string }) {
  return (
    <WaitingNotice
      detail={`pupitred linux-${arch} part sur le canal et s'installe dans /usr/local/bin.`}
      note="La somme de contrôle du binaire reçu est vérifiée avant la première commande."
      title="Envoi de l'agent sur le serveur"
    />
  );
}
