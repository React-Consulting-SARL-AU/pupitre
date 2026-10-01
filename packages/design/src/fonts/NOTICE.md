# Embedded fonts

`--font-display` names Bricolage Grotesque, which headings ask for;
`--font-data` names JetBrains Mono, for any data. The files are committed and
served from the app's resources and from the site: nothing is loaded from the
Internet, the app renders the same offline, and the site contacts no third
party for its fonts.

| File | Family | Weight | Subset | Source | Licence | Retrieved on |
| --- | --- | --- | --- | --- | --- | --- |
| `bricolage-grotesque-700-latin.woff2` | Bricolage Grotesque | 700 | latin | https://fonts.gstatic.com/s/bricolagegrotesque/v9 (static instance served by Google Fonts) | SIL OFL 1.1 | 2026-09-04 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | 100 to 800 (variable) | latin | https://fonts.gstatic.com/s/jetbrainsmono/v24 (variable file served by Google Fonts) | SIL OFL 1.1 | 2026-09-24 |

The upstream project of Bricolage Grotesque is
[ateliertriay/bricolage](https://github.com/ateliertriay/bricolage), by Mathieu
Triay; its licence is in [`OFL.txt`](./OFL.txt), copied from that repository.
The one of JetBrains Mono is
[JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono); its
licence is in [`OFL-JetBrainsMono.txt`](./OFL-JetBrainsMono.txt), copied from
that repository.

## What the licence allows

The SIL Open Font License 1.1 allows using, studying, modifying and
redistributing a font, including **embedded in a commercial product**: it does
not extend to the software that ships with it. Three conditions concern us.

- A font is never sold on its own; it is distributed with the app and served
  with the site.
- Each file comes with its copyright notice and the text of its licence,
  alongside, and the app's package embeds them.
- No **Reserved Font Name** is declared in the upstream copyright notices, so
  the Latin subsets keep their family name without renaming it.

## The embedded weights

Only the 700 of Bricolage Grotesque is embedded, because only the 700 is used:
`--font-display-weight` is 700. One more weight is justified the day a screen
asks for one.

JetBrains Mono is a single variable file, which covers the 400 of body text and
the 500 of labels without a second download.

The Latin subsets cover French, accents and the `œ` ligature included; the
`unicode-range` of `fonts.css` is that of these subsets, so that a character
outside the coverage falls back cleanly to the system font rather than drawing
a missing glyph.

`font-display: block` keeps the text invisible for the short time it takes to
read a local or preloaded file, rather than showing a fallback font, then
swapping it and making the page shift.

## The generator's TrueType copy

`scripts/fonts/bricolage-grotesque-700.ttf` is the same weight, in TrueType
format, read only by `scripts/generate-brand.ts`: the generator outlines
"Pupitre" for the brand kit's lockups, and the tool that does that work cannot
read woff2. This file is never served nor embedded in a binary; it never leaves
generation time. Same source, same licence, same date as the first row of the
table.
