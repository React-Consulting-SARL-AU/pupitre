import { Button } from "@renderer/components/ui/button";
import { LogIn, X } from "lucide-react";

/**
 * The bar that turns an agent's login address into a page of this tab.
 *
 * The address itself stays in the main process; what is shown here is the host
 * it leads to, so the reader knows where the page comes from before it opens.
 * The code the provider hands back is typed into the session by the app: the
 * round trip never leaves the window.
 */
export function TerminalLoginBar({
  host,
  open,
  onOpen,
  onClose,
}: {
  host: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-line border-b bg-raised px-3 py-2">
      <LogIn className="shrink-0 text-ink-3" size={14} strokeWidth={1.5} />

      <p className="min-w-0 flex-1 text-[12px] text-ink-2">
        {open
          ? "Connexion en cours sur "
          : "Cette session attend une connexion sur "}
        <span className="font-data text-ink">{host}</span>
      </p>

      {open ? (
        <Button icon={X} onClick={onClose} size="sm" variant="discreet">
          Fermer la page
        </Button>
      ) : (
        <Button icon={LogIn} onClick={onOpen} size="sm" variant="inverse">
          Se connecter ici
        </Button>
      )}
    </div>
  );
}
