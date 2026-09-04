import { Callout } from "@renderer/components/ui/callout";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { TERMINAL_FONT } from "@renderer/lib/completion";
import { type PatchRow, parsePatch } from "@renderer/lib/patch";
import type { DiffState } from "@renderer/stores/project";
import { useMemo } from "react";

/**
 * A patch row reads by its sign first.
 *
 * The tint is `ok` or `danger` at a tenth of an opacity — enough to group the
 * lines at a glance, never enough to be the only thing saying what they are.
 */
const ROW: Record<
  PatchRow["kind"],
  { sign: string; background: string; text: string }
> = {
  add: { background: "bg-ok/10", sign: "+", text: "text-ok" },
  context: { background: "", sign: " ", text: "text-ink-2" },
  hunk: { background: "bg-sunken", sign: " ", text: "text-ink-3" },
  meta: { background: "", sign: " ", text: "text-ink-3" },
  remove: { background: "bg-danger/10", sign: "−", text: "text-danger" },
};

function Rows({ patch, problem }: { patch: string; problem: string }) {
  const rows = useMemo(() => parsePatch(patch), [patch]);

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-[12px] text-ink-3">
        {problem || "Aucun changement textuel dans ce fichier."}
      </p>
    );
  }

  return (
    <div className="min-w-max">
      {problem ? (
        <div className="border-line border-b p-2">
          <Callout tone="warn">{problem}</Callout>
        </div>
      ) : null}
      <table
        className="w-full border-collapse"
        style={{ fontFamily: TERMINAL_FONT, fontSize: 11.5 }}
      >
        <tbody>
          {rows.map((row, index) => {
            const look = ROW[row.kind];

            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a patch is a sequence, its position IS its identity
              <tr className={look.background} data-kind={row.kind} key={index}>
                <td className="w-10 select-none border-line border-r px-1.5 text-right align-top text-[10px] text-ink-3 tabular-nums">
                  {row.before ?? ""}
                </td>
                <td className="w-10 select-none border-line border-r px-1.5 text-right align-top text-[10px] text-ink-3 tabular-nums">
                  {row.after ?? ""}
                </td>
                <td
                  className={`select-none pr-1 pl-2 text-center ${look.text} align-top`}
                >
                  {look.sign}
                </td>
                <td className={`whitespace-pre pr-4 ${look.text} align-top`}>
                  {row.text || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Waiting, read, refused or nothing chosen — never a bare spinner. */
export function ProjectDiffPatch({
  state,
  onRetry,
}: {
  state: DiffState;
  onRetry: () => void;
}) {
  if (state.status === "idle") {
    return <EmptyState title="Choisissez un fichier." />;
  }

  if (state.status === "reading") {
    return (
      <p className="flex items-center justify-center gap-2 p-6 text-[12px] text-ink-3">
        <StatusDot shape="breathing" size={11} />
        lecture du diff…
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="p-4">
        <ErrorNotice error={state.error} onRetry={onRetry} />
      </div>
    );
  }

  if (state.diff.binary) {
    return (
      <p className="p-6 text-center text-[12px] text-ink-3">
        Fichier binaire — rien à montrer ligne à ligne.
      </p>
    );
  }

  return <Rows patch={state.diff.patch} problem={state.diff.problem} />;
}
