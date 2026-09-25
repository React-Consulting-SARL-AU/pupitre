import { Button } from "@renderer/components/ui/button";
import { Dialog } from "@renderer/components/ui/dialog";
import { controlClass, Field, fieldAria } from "@renderer/components/ui/field";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useSudoPassword } from "@renderer/stores/sudo-password";
import { KeyRound } from "lucide-react";
import { useRef, useState } from "react";

const NAME = "sudo-enter";

/**
 * The sudo password of `dev`, typed on a computer that does not hold it. The
 * main process keeps it once sudo on the server has taken it; the field is
 * emptied either way.
 */
export function ServerSudoEnterDialog({
  serverId,
  open,
  onClose,
}: {
  serverId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const enter = useSudoPassword((store) => store.enter);

  const input = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function close(): void {
    setPassword("");
    setProblem(null);
    onClose();
  }

  async function keep(): Promise<void> {
    const typed = password;
    setPassword("");

    const outcome = await enter(serverId, typed);

    if (outcome.ok) {
      close();

      return;
    }

    const said = agentText(t, outcome.error);
    setProblem(said.fix ? `${said.message} ${said.fix}` : said.message);
  }

  return (
    <Dialog
      actions={
        <>
          <Button onClick={close} variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={password === ""}
            icon={KeyRound}
            onClick={keep}
            variant="inverse"
          >
            {t("sudo.enter.confirm")}
          </Button>
        </>
      }
      focus={input}
      name={NAME}
      onClose={close}
      open={open}
      title={t("sudo.password.enter")}
    >
      <Field
        help={t("sudo.enter.help")}
        label={t("sudo.password.label")}
        name={NAME}
        problem={problem ?? undefined}
        required
      >
        <input
          {...fieldAria({
            help: true,
            name: NAME,
            problem: problem !== null,
            required: true,
          })}
          autoComplete="off"
          className={controlClass("data", problem !== null)}
          onChange={(event) => {
            setPassword(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && password !== "") {
              event.preventDefault();
              keep();
            }
          }}
          ref={input}
          type="password"
          value={password}
        />
      </Field>
    </Dialog>
  );
}
