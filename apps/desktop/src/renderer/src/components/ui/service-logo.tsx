import { logoFor } from "@pupitre/design/logos";
import { Box } from "lucide-react";
import type { ButtonIcon } from "./button";

const GLYPHS = new Map<string, ButtonIcon>();

/**
 * A module's logo in the shape of a Lucide icon, so a button can hold it where
 * it would hold a glyph — or nothing, when the module has no logo to show. A
 * monochrome mark takes the button's ink; one in colour keeps its own.
 */
export function logoGlyph(moduleId: string): ButtonIcon | null {
  const logo = logoFor(moduleId);

  if (!logo) {
    return null;
  }

  let glyph = GLYPHS.get(moduleId);

  if (!glyph) {
    glyph = ({ size = 16, className = "" }) => (
      <span
        className={`inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the markup is a build-time fragment of @pupitre/design, never a value from the agent
        dangerouslySetInnerHTML={{ __html: logo.svg }}
        data-logo={moduleId}
        style={{ height: size, width: size }}
      />
    );
    GLYPHS.set(moduleId, glyph);
  }

  return glyph;
}

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

/** The plate's edge, for a line that wants to sit level with the logo. */
export function plateOf(size: number): number {
  return Math.round(size * 1.5);
}

export function ServiceLogo({
  moduleId,
  name,
  size = 24,
  fallback: Fallback = Box,
}: {
  moduleId: string | null;
  name: string;
  size?: 16 | 20 | 24 | 32;
  /** The glyph that stands in when the module has no logo we may redistribute. */
  fallback?: ButtonIcon;
}) {
  const logo = moduleId ? logoFor(moduleId) : null;
  const plate = plateOf(size);
  const style = { height: plate, width: plate };

  if (!logo) {
    return (
      <span
        className={`${PLATE} text-ink-3`}
        data-logo-fallback={moduleId ?? "none"}
        style={style}
        title={name}
      >
        <Fallback size={size * 0.7} strokeWidth={1.5} />
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
