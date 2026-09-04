import { logoFor } from "@pupitre/design/logos";
import { Box } from "lucide-react";

/**
 * The one splash of colour the system allows, and its fallback.
 *
 * A module with a licit logo shows it as it is, uncropped and untinted, on a
 * plate of `surface`. A module without one — no redistributable mark, or a
 * module this app has never heard of — gets a Lucide glyph on the same plate,
 * at the same size: the row stays even either way.
 */

const PLATE =
  "inline-flex shrink-0 items-center justify-center rounded-sm border border-line bg-surface";

export function ServiceLogo({
  moduleId,
  name,
  size = 24,
}: {
  moduleId: string;
  name: string;
  size?: 16 | 20 | 24 | 32;
}) {
  const logo = logoFor(moduleId);
  const plate = Math.round(size * 1.5);
  const style = { height: plate, width: plate };

  if (!logo) {
    return (
      <span
        className={`${PLATE} text-ink-3`}
        data-logo-fallback={moduleId}
        style={style}
        title={name}
      >
        <Box size={size * 0.7} strokeWidth={1.5} />
      </span>
    );
  }

  return (
    <span
      className={`${PLATE} ${logo.monochrome ? "text-ink" : ""}`}
      data-logo={moduleId}
      style={style}
      title={name}
    >
      <span
        className="inline-flex [&>svg]:h-full [&>svg]:w-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the markup is a build-time fragment of @pupitre/design, never a value from the agent
        dangerouslySetInnerHTML={{ __html: logo.svg }}
        style={{ height: size, width: size }}
      />
    </span>
  );
}
