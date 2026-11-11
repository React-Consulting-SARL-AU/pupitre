export function SettingsAgentsEntry({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="px-5 py-3.5" data-agent-entry={name}>
      <div className="break-words font-data text-control text-ink">{name}</div>
      <div className="mt-0.5 text-ink-3 text-small leading-relaxed">
        {description}
      </div>
    </div>
  );
}
