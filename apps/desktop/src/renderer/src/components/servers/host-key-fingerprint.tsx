import { Label } from "../ui/label";

export function HostKeyFingerprint({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <p className="mt-1 break-all font-data text-ink-2 text-small leading-relaxed">
        {value}
      </p>
    </div>
  );
}
