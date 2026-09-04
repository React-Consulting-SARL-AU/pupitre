import type { SecretStatus } from "@pupitre/shared/agent-protocol/secrets";
import { Button } from "@renderer/components/ui/button";
import { fieldControlClass } from "@renderer/components/ui/field";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { Check, Lock } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * One environment key, and the one gesture it accepts.
 *
 * The agent says whether the key is filled in; it never says with what, and
 * there is nowhere here to put a value. A new one goes out on the protocol's
 * secret line and does not come back.
 */
export function SecretsRow({
  secret,
  open,
  saving,
  onOpen,
  onSave,
}: {
  secret: SecretStatus;
  open: boolean;
  saving: boolean;
  onOpen: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) {
      setValue("");
    }
  }, [open]);

  return (
    <div className="border-line border-b last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Lock className="shrink-0 text-ink-3" size={13} strokeWidth={1.5} />

        <p className="min-w-0 flex-1 truncate font-data text-[12px] text-ink">
          {secret.key}
        </p>

        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-data text-[10px] text-ink-2 ${
            secret.set ? "border-ok/40" : "border-warn/40"
          }`}
          data-state={secret.set ? "set" : "missing"}
        >
          <StatusDot
            shape={secret.set ? "filled" : "empty"}
            size={9}
            tone={secret.set ? "ok" : "warn"}
          />
          {secret.set ? "en place" : "absente"}
        </span>

        <Button onClick={onOpen} size="sm">
          {open ? "Annuler" : "Remplacer"}
        </Button>
      </div>

      {open ? (
        <form
          className="flex items-center gap-2 border-line border-t bg-sunken px-4 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(value);
          }}
        >
          <input
            autoComplete="off"
            className={`min-w-0 flex-1 ${fieldControlClass}`}
            onChange={(event) => setValue(event.target.value)}
            placeholder={`nouvelle valeur pour ${secret.key}`}
            spellCheck={false}
            type="password"
            value={value}
          />
          <Button
            disabled={value.length === 0}
            icon={Check}
            loading={saving}
            submit
            variant="inverse"
          >
            Enregistrer
          </Button>
        </form>
      ) : null}
    </div>
  );
}
