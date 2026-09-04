/**
 * A patch, turned into rows with their line numbers.
 *
 * The numbers come from the hunk headers — the only place git states them — and
 * are then incremented per row. Anything before the first hunk is the file
 * header: kept, dimmed, because "new file mode" and "rename from" are exactly
 * what you want to read on those files.
 */

export interface PatchRow {
  kind: "meta" | "hunk" | "add" | "remove" | "context";
  text: string;
  /** Line numbers on each side, when the row has one. */
  before: number | null;
  after: number | null;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function meta(text: string): PatchRow {
  return { after: null, before: null, kind: "meta", text };
}

export function parsePatch(patch: string): PatchRow[] {
  const rows: PatchRow[] = [];
  let before = 0;
  let after = 0;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    const hunk = HUNK.exec(line);

    if (hunk) {
      before = Number.parseInt(hunk[1], 10);
      after = Number.parseInt(hunk[2], 10);
      inHunk = true;
      rows.push({ after: null, before: null, kind: "hunk", text: line });

      continue;
    }

    if (!inHunk) {
      // The last line of the split is empty when the patch ends with a newline.
      if (line.length > 0) {
        rows.push(meta(line));
      }

      continue;
    }

    if (line.startsWith("+")) {
      rows.push({
        after: after++,
        before: null,
        kind: "add",
        text: line.slice(1),
      });
    } else if (line.startsWith("-")) {
      rows.push({
        after: null,
        before: before++,
        kind: "remove",
        text: line.slice(1),
      });
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — git's own note, not a line of content.
      rows.push(meta(line));
    } else if (line.length > 0 || rows.length > 0) {
      rows.push({
        after: after++,
        before: before++,
        kind: "context",
        text: line.startsWith(" ") ? line.slice(1) : line,
      });
    }
  }

  // A trailing empty context row is the split artefact, not a line of the file.
  const last = rows.at(-1);

  if (last && last.kind === "context" && last.text === "") {
    rows.pop();
  }

  return rows;
}

export function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf("/");

  return cut === -1
    ? { dir: "", name: path }
    : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}
