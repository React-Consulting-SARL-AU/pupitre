type Point = readonly [number, number];

interface Stroke {
  from: Point;
  to: Point;
}

/** The `>_` of the app icon, in the icon's own 1024 units. */
const GLYPH: readonly Stroke[] = [
  { from: [300, 362], to: [450, 512] },
  { from: [450, 512], to: [300, 662] },
  { from: [555, 660], to: [725, 660] },
];
const STROKE_WIDTH = 84;
const CENTRE = 512;
/** How much of the icon the drawing covers: the glyph alone, with a little air around it. */
const VIEW = 600;
const OPAQUE = 255;

function distanceTo(point: Point, { from, to }: Stroke): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const along =
    ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) /
    (dx * dx + dy * dy);
  const t = Math.min(Math.max(along, 0), 1);

  return Math.hypot(
    point[0] - (from[0] + t * dx),
    point[1] - (from[1] + t * dy)
  );
}

/**
 * The glyph on transparency, `size` pixels square, as raw 32-bit pixels of grey level `ink`.
 * Alpha carries the shape: macOS paints a template image in the menu bar's own colour and ignores `ink`.
 */
export function trayBitmap(size: number, ink: number): Buffer {
  const unit = VIEW / size;
  const origin = CENTRE - VIEW / 2;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point: Point = [
        origin + (x + 0.5) * unit,
        origin + (y + 0.5) * unit,
      ];
      const nearest = Math.min(
        ...GLYPH.map((stroke) => distanceTo(point, stroke))
      );
      const coverage = (STROKE_WIDTH / 2 - nearest) / unit + 0.5;
      const at = (y * size + x) * 4;

      pixels.fill(ink, at, at + 3);
      pixels[at + 3] = Math.round(Math.min(Math.max(coverage, 0), 1) * OPAQUE);
    }
  }

  return pixels;
}
