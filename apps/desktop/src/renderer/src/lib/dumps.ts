/**
 * The database a dump feeds, read off its file name the way the agent reads it.
 *
 * `fulldump_shop_20260101.sql` and `dump_shop_3.sql.gz` feed `shop`; anything
 * else feeds the database named before the first dot. `db.import { name }`
 * takes that name, never the file's: the app derives it here rather than
 * sending a file name the agent would match against nothing.
 */
const NAMED_DUMP = /^(?:fulldump|dump)_([A-Za-z0-9_]+)_[0-9]+\./;

export function databaseOfDump(fileName: string): string {
  const named = NAMED_DUMP.exec(fileName);

  if (named) {
    return named[1];
  }

  const dot = fileName.indexOf(".");

  return dot === -1 ? fileName : fileName.slice(0, dot);
}
