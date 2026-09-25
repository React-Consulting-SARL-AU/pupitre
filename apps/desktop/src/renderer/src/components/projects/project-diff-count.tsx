export function ProjectDiffCount({
  added,
  removed,
}: {
  added: number;
  removed: number;
}) {
  if (added <= 0 && removed <= 0) {
    return null;
  }

  return (
    <span className="shrink-0 font-data text-caption tabular-nums">
      {added > 0 ? <span className="text-ok">+{added}</span> : null}
      {added > 0 && removed > 0 ? " " : null}
      {removed > 0 ? <span className="text-danger">−{removed}</span> : null}
    </span>
  );
}
