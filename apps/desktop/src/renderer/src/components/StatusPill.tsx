import type { ProjectState } from "@shared/contract";

/**
 * The state reads through its shape as much as its colour: colour alone would
 * exclude those who cannot tell them apart, and a table you scan needs a marker
 * that catches the eye before the reading.
 */
const APPEARANCE: Record<ProjectState, { text: string; className: string }> = {
  online: { text: "online", className: "text-ok border-ok" },
  service: { text: "service", className: "text-ok border-ok" },
  external: { text: "external", className: "text-ok border-ok" },
  starting: { text: "starting", className: "text-warn border-warn" },
  failed: { text: "failed", className: "text-danger border-danger" },
  down: { text: "down", className: "text-danger border-danger" },
  stopped: { text: "stopped", className: "text-ink-4 border-line-strong" },
};

export function StatusPill({ state }: { state: ProjectState }) {
  const { text, className } = APPEARANCE[state] ?? APPEARANCE.stopped;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-bold font-mono text-[10px] ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}
