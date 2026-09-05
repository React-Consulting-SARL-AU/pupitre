import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { markSvg, ON_LIGHT } from "@pupitre/design/brand";
import { Resvg } from "@resvg/resvg-js";

/**
 * Renders the app icon from the one definition of the mark, in
 * `@pupitre/design/brand`. Nothing here is drawn by hand: `bun run icons`
 * rebuilds `build/icon.png` and `build/icon.icns` from it, and both are
 * committed because electron-builder reads them before anything is installed.
 *
 * Rendering goes through resvg, not ImageMagick: ImageMagick's internal SVG
 * renderer ignores strokes and produced a black square.
 */
const ROOT = dirname(import.meta.dir);
const BUILD = join(ROOT, "build");

// The sizes macOS expects in an .iconset. 64 is there as the @2x of 32, never as
// a size of its own: `icon_64x64.png` is not a valid name.
const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const SINGLE = new Set([16, 32, 128, 256, 512]);
const RETINA = new Set([32, 64, 256, 512, 1024]);
const COMPACT_UNDER = 24;

/**
 * macOS draws every app icon on the same grid: an 824-wide shape centred on a
 * 1024 canvas, with Apple's corner radius rather than ours. A full-bleed icon
 * would sit visibly larger than its neighbours in the Dock.
 */
const MACOS = { inset: 100, radius: 185 };

const macos = (compact: boolean): string =>
  markSvg({ colors: ON_LIGHT, compact, ...MACOS });

// Linux and Windows draw the icon edge to edge, so this one keeps its own
// corners and fills the canvas.
const square = (compact: boolean): string =>
  markSvg({ colors: ON_LIGHT, compact });

const render = (svg: string, size: number): Buffer =>
  new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

const iconset = join(BUILD, "icon.iconset");

await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });

for (const size of SIZES) {
  const png = render(macos(size < COMPACT_UNDER), size);

  if (SINGLE.has(size)) {
    await writeFile(join(iconset, `icon_${size}x${size}.png`), png);
  }
  if (RETINA.has(size)) {
    await writeFile(join(iconset, `icon_${size / 2}x${size / 2}@2x.png`), png);
  }
}

await writeFile(join(BUILD, "icon.png"), render(square(false), 1024));

const icns = spawnSync(
  "iconutil",
  ["-c", "icns", iconset, "-o", join(BUILD, "icon.icns")],
  { stdio: "inherit" }
);

if (icns.error || icns.status !== 0) {
  throw new Error(
    "iconutil failed: the .icns is built on macOS, and only there. build/icon.png is written either way."
  );
}

await rm(iconset, { recursive: true, force: true });

console.log(
  "build/icon.png and build/icon.icns written from @pupitre/design/brand"
);
