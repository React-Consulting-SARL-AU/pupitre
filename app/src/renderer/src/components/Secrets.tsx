import type { Secret } from "@shared/contract";
import {
  Check,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

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
          <Lock className="shrink-0 text-ink-4" size={13} />
        ) : (
          <Eye className="shrink-0 text-ink-4" size={13} />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px]">{secret.key}</p>
          <p className="truncate font-mono text-[10px] text-ink-4">
            {secret.set
              ? secret.sensitive
                ? `${secret.length} characters · value hidden`
                : secret.preview
              : "no value"}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] ${
            secret.set ? "bg-ok/12 text-ok" : "bg-warn/12 text-warn"
          }`}
        >
          {secret.set ? "in place" : "missing"}
        </span>

        <button
          className="transition-soft shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-ink-3 hover:border-accent hover:text-accent-strong"
          onClick={onOpen}
          type="button"
        >
          {open ? "Cancel" : "Replace"}
        </button>
      </div>

      {open ? (
        <form
          className="flex animate-[fade-in_160ms_ease-out] items-center gap-2 border-line border-t bg-sunken px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(value);
          }}
        >
          {/* biome-ignore lint/a11y/noAutofocus: the field is the whole point of the expanded row */}
          <input
            autoComplete="off"
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-base px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
            onChange={(e) => setValue(e.target.value)}
            placeholder={`new value for ${secret.key}`}
            spellCheck={false}
            type="password"
            value={value}
          />
          <button
            className="transition-soft flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-[12px] text-base hover:bg-accent-strong disabled:opacity-40"
            disabled={value.length === 0 || busy}
            type="submit"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={13} />
            ) : (
              <Check size={13} />
            )}
            Save
          </button>
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

  async function load() {
    setList(await window.pupitre.secrets());
  }

  useEffect(() => {
    load();
  }, []);

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
        <div className="flex items-start gap-3">
          <KeyRound className="mt-1 shrink-0 text-accent" size={18} />
          <div className="min-w-0">
            <h1 className="font-semibold text-xl tracking-tight">Secrets</h1>
            <p className="mt-1 text-ink-3 leading-relaxed">
              The environment keys the server keeps for its services — it alone
              knows which ones and where. The app only sees their state: a
              replaced value goes out through the standard input of a dedicated
              ssh, never through a command line, and does not come back.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-4">
            <ShieldCheck size={13} />
            {list
              ? `${list.length - missing} of ${list.length} in place`
              : "reading…"}
          </span>
          <button
            className="transition-soft ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-3 hover:border-accent hover:text-accent-strong"
            onClick={load}
            type="button"
          >
            <RotateCw size={12} />
            Reload
          </button>
        </div>

        {error ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
            <TriangleAlert className="mt-px shrink-0" size={13} />
            {error}
          </p>
        ) : null}

        {note ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink-2">
            {note}
          </pre>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
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
            <p className="px-4 py-6 text-center text-ink-4">reading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
