import type { ConnectionState } from "@shared/contract";
import { useState } from "react";
import { Logo } from "./Logo";

/**
 * What shows when the connection does not answer.
 *
 * This is the first screen of a fresh install, so it has to stand on its own:
 * every check carries its remedy, and the screen shows the SSH configuration
 * block to copy rather than pointing at documentation.
 */
export function ConnectionSetup({
  connection,
  onRetry,
  onSettings,
}: {
  connection: ConnectionState;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const [installLog, setInstallLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firstFailure = connection.diagnostics.find((d) => !d.ok);
  const hostMissing = firstFailure?.step === "host";

  async function install() {
    setBusy(true);
    setInstallLog("Configuring…");
    const present = await window.pupitre.installerPresent();
    if (!present) {
      setInstallLog(
        "The stack install script could not be found. Configure the host by hand with the block above."
      );
      setBusy(false);
      return;
    }
    const res = await window.pupitre.install();
    setInstallLog(res.output.slice(-2000));
    setBusy(false);
    onRetry();
  }

  return (
    <div className="grid h-full place-items-center px-8">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <p className="font-mono text-[11px] text-accent uppercase tracking-[0.13em]">
            Connection
          </p>
        </div>
        <h1 className="mt-3 font-semibold text-2xl tracking-tight">
          {hostMissing
            ? "This computer is not set up yet"
            : "The server is not answering"}
        </h1>
        <p className="mt-2 text-ink-3 leading-relaxed">
          {hostMissing
            ? `The app talks to your server over SSH, reusing your system configuration: it keeps neither password nor key. It needs a host named "${connection.host}" — or another one, to be picked in the settings.`
            : "Here is where it is stuck, and what fixes it."}
        </p>

        {hostMissing ? (
          <div className="mt-4">
            <p className="mb-1.5 font-mono text-[10px] text-ink-4 uppercase tracking-[0.08em]">
              To add to ~/.ssh/config
            </p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[11px] text-ink-2">
              {`Host ${connection.host}
  HostName 203.0.113.10        # your server's address
  User dev
  IdentityFile ~/.ssh/id_ed25519
  ControlMaster auto
  ControlPath ~/.ssh/cm-%r@%h:%p
  ControlPersist 10m`}
            </pre>
            <p className="mt-1.5 text-[12px] text-ink-4">
              The last three lines keep the connection open: without them every
              poll reopens a tunnel and the interface drags.
            </p>
          </div>
        ) : null}

        <div className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {connection.diagnostics.map((d) => (
            <div className="flex gap-3 px-4 py-3" key={d.step}>
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${d.ok ? "bg-ok" : "bg-danger"}`}
              />
              <div className="min-w-0">
                <p className="font-medium">{d.title}</p>
                <p className="font-mono text-[11px] text-ink-4">{d.detail}</p>
                {d.ok ? null : (
                  <p className="mt-1 text-[12px] text-accent-strong">{d.fix}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="clickable rounded-lg bg-accent px-4 py-2 font-semibold text-[13px] text-base transition-soft hover:bg-accent-strong"
            onClick={onRetry}
            type="button"
          >
            Retry
          </button>
          <button
            className="clickable rounded-lg border border-line-strong px-4 py-2 text-[13px] transition-soft hover:border-accent"
            onClick={onSettings}
            type="button"
          >
            Switch server
          </button>
          {hostMissing ? (
            <button
              className="clickable rounded-lg border border-line-strong px-4 py-2 text-[13px] transition-soft hover:border-accent disabled:opacity-50"
              disabled={busy}
              onClick={install}
              type="button"
            >
              {busy ? "Configuring…" : "Run the stack script"}
            </button>
          ) : null}
        </div>

        {installLog ? (
          <pre className="mt-4 max-h-56 overflow-auto rounded-lg border border-line bg-sunken p-3 font-mono text-[11px] text-ink-3">
            {installLog}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
