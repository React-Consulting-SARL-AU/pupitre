import type { ViewBounds } from "@shared/terminals";

/** Small enough to sit in a tab, large enough to be found and closed. */
const MINIMUM = 40;

export function readBounds(value: unknown): ViewBounds | null {
  const box = value as Partial<ViewBounds> | null;
  const numbers = [box?.x, box?.y, box?.width, box?.height];
  const usable = numbers.every(
    (number) => typeof number === "number" && Number.isFinite(number)
  );

  return usable ? (box as ViewBounds) : null;
}

export function insideFrame(
  bounds: ViewBounds,
  frame: { width: number; height: number }
): ViewBounds {
  const width = Math.min(Math.round(bounds.width), frame.width);
  const height = Math.min(Math.round(bounds.height), frame.height);

  return {
    height: Math.max(height, MINIMUM),
    width: Math.max(width, MINIMUM),
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
  };
}
