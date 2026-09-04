import type { Server } from "@shared/servers";
import { Button } from "../ui/button";
import { CopyField } from "../ui/copy-field";

/**
 * What is left to do on the server, and it is one line.
 *
 * The private half never appears here nor anywhere else in the interface: what
 * the user carries to their machine is the public half, and the command that
 * installs it.
 */
export function ServerKeyCard({
  server,
  publicKey,
  copyId,
  onDone,
}: {
  server: Server;
  publicKey: string;
  copyId: string | null;
  onDone: () => void;
}) {
  return (
    <div className="elevation-raised fade-in rounded-md border border-line bg-surface p-5">
      <h3 className="font-medium text-ink">
        {server.name} est prêt à recevoir sa clé
      </h3>
      <p className="mt-1 text-ink-3 leading-relaxed">
        La clé privée reste dans le dossier de l'app, en 0600. Portez la moitié
        publique sur le serveur — la commande ci-dessous le fait pour vous.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        <CopyField
          help="À ajouter dans ~/.ssh/authorized_keys du serveur si vous préférez le faire à la main."
          label="Clé publique"
          value={publicKey}
        />

        {copyId ? (
          <CopyField
            help="À coller dans un terminal de cet ordinateur. Le mot de passe demandé est celui du serveur."
            label="Commande à coller"
            value={copyId}
          />
        ) : null}
      </div>

      <div className="mt-5">
        <Button onClick={onDone} variant="inverse">
          Terminé
        </Button>
      </div>
    </div>
  );
}
