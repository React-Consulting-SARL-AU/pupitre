import type { Secret } from "@shared/contract";
import { Check, Eye, Lock, RotateCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Callout } from "./ui/callout";
import { fieldControlClass } from "./ui/field";
import { PageHeader } from "./ui/page-header";
import { StatusDot } from "./ui/status-dot";

/**
 * The state of the server's secrets — never their value.
 *
 * The server decides what is sensitive and only returns a preview for the rest:
 * a zone identifier or a user name can be read without risk, a token never. The
 * length is enough to know a key is in place, and that is already all we need to
 * diagnose.
 *
 * Which keys exist, where they are stored and what has to be restarted after
 * changing them: all of that comes from the server. A console that named a file
 * or a password manager here would be wrong on the next machine — and has no way
 * of knowing anyway.
 */

/** What can be said about a value without saying the value. */
function describe(secret: Secret): string {
  if (!secret.set) {
    return "no value";
  }
  if (secret.sensitive) {
    return `${secret.length} characters · value hidden`;
  }
  return secret.preview;
}

function Row({
  secret,
  open,
  onOpen,
  onSave,
  busy,
}: {
  secret: Secret;
  open: boolean;
  onOpen: () => void;
  onSave: (value: string) => Promise<void>;
  busy: boolean;
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
        {secret.sensitive ? (
          <Lock className="shrink-0 text-ink-3" size={13} strokeWidth={1.5} />
        ) : (
          <Eye className="shrink-0 text-ink-3" size={13} strokeWidth={1.5} />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-data text-[12px] text-ink">
            {secret.key}
          </p>
          <p className="truncate font-data text-[10px] text-ink-3">
            {describe(secret)}
          </p>
        </div>

        <span
          className="flex shrink-0 items-center gap-1.5 rounded-sm border border-line-strong px-1.5 py-0.5 font-data text-[10px] text-ink-2"
          data-state={secret.set ? "set" : "missing"}
        >
          <StatusDot
            shape={secret.set ? "filled" : "empty"}
            size={9}
            tone={secret.set ? "ok" : "warn"}
          />
          {secret.set ? "in place" : "missing"}
        </span>

        <Button onClick={onOpen} size="sm">
          {open ? "Cancel" : "Replace"}
        </Button>
      </div>

      {open ? (
        <form
          className="flex animate-[fade-in_160ms_ease-out] items-center gap-2 border-line border-t bg-sunken px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(value);
          }}
        >
          <input
            autoComplete="off"
            autoFocus
            className={`min-w-0 flex-1 ${fieldControlClass}`}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`new value for ${secret.key}`}
            spellCheck={false}
            type="password"
            value={value}
          />
          <Button
            disabled={value.length === 0}
            icon={Check}
            loading={busy}
            submit
            variant="inverse"
          >
            Save
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function Secrets() {
  const [list, setList] = useState<Secret[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList(await window.pupitre.secrets());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(key: string, value: string) {
    setBusy(key);
    setError(null);
    const res = await window.pupitre.setSecret(key, value);
    setBusy(null);
    if (res.ok) {
      setOpen(null);
      // The server itself says what has to be restarted, if anything has to be:
      // we repeat it, adding nothing.
      setNote(res.message || `${key} saved.`);
      await load();
    } else {
      setError(res.message || "the server refused the value");
    }
  }

  const missing = list?.filter((s) => !s.set).length ?? 0;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl">
        <PageHeader
          description="The environment keys the server keeps for its services — it alone knows which ones and where. The app only sees their state: a replaced value goes out through the standard input of a dedicated ssh, never through a command line, and does not come back."
          eyebrow="Server"
          title="Secrets"
        />

        <div className="mt-4 flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-data text-[11px] text-ink-3">
            <ShieldCheck size={13} strokeWidth={1.5} />
            {list
              ? `${list.length - missing} of ${list.length} in place`
              : "reading…"}
          </span>
          <Button className="ml-auto" icon={RotateCw} onClick={load} size="sm">
            Reload
          </Button>
        </div>

        {error ? (
          <div className="mt-3">
            <Callout tone="danger">{error}</Callout>
          </div>
        ) : null}

        {note ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-sm border border-line bg-surface px-3 py-2 font-data text-[11px] text-ink-2">
            {note}
          </pre>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface">
          {list ? (
            list.map((secret) => (
              <Row
                busy={busy === secret.key}
                key={secret.key}
                onOpen={() =>
                  setOpen((o) => (o === secret.key ? null : secret.key))
                }
                onSave={(v) => save(secret.key, v)}
                open={open === secret.key}
                secret={secret}
              />
            ))
          ) : (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-ink-3">
              <StatusDot shape="breathing" size={11} />
              reading the keys the server keeps…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
