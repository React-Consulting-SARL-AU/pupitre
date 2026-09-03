import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/**
 * Rasterises build/icon.svg into the macOS icon set.
 *
 * Rendering goes through resvg, not ImageMagick: ImageMagick's internal SVG
 * renderer ignores gradients and strokes, and produced a black square.
 */
const ROOT = dirname(import.meta.dir);
// The sizes macOS expects in an .iconset. 64 is there as the @2x of 32, never as
// a size of its own: `icon_64x64.png` is not a valid name.
const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const SINGLE = new Set([16, 32, 128, 256, 512]);
const RETINA = new Set([32, 64, 256, 512, 1024]);

const svg = await readFile(join(ROOT, "build/icon.svg"), "utf8");
const iconset = join(ROOT, "build/icon.iconset");

await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });

for (const size of SIZES) {
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
  })
    .render()
    .asPng();

  if (SINGLE.has(size)) {
    await writeFile(join(iconset, `icon_${size}x${size}.png`), png);
  }
  if (RETINA.has(size)) {
    await writeFile(join(iconset, `icon_${size / 2}x${size / 2}@2x.png`), png);
  }
  if (size === 512) {
    await writeFile(join(ROOT, "build/icon.png"), png);
  }
}

console.log(`${SIZES.length} sizes rendered`);
