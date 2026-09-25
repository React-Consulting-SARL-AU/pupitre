// Mirrors the agent's parsing: `db.import` takes the database name, never the file name.
const NAMED_DUMP = /^(?:fulldump|dump)_([A-Za-z0-9_]+)_[0-9]+\./;

export function databaseOfDump(fileName: string): string {
  const named = NAMED_DUMP.exec(fileName);

  if (named) {
    return named[1];
  }

  const dot = fileName.indexOf(".");

  return dot === -1 ? fileName : fileName.slice(0, dot);
}
