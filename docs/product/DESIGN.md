---
name: Pupitre
description: Your AI agents get a machine of their own. Your laptop cools down.
colors:
  light:
    base: "#ffffff"
    surface: "#f7f7f7"
    sunken: "#efefef"
    raised: "#e6e6e6"
    ink: "#0a0a0a"
    ink-2: "#4a4a4a"
    ink-3: "#676767"
    ink-4: "#838383"
    line: "#e3e3e3"
    line-strong: "#c9c9c9"
    inverse: "#0a0a0a"
    inverse-ink: "#ffffff"
    ok: "#1f7a45"
    warn: "#8a5f00"
    danger: "#b3362a"
    frost: "#2f6cae"
    frost-soft: "#bfdcf3"
  dark:
    base: "#0a0a0a"
    surface: "#111111"
    sunken: "#161616"
    raised: "#1e1e1e"
    ink: "#f5f5f5"
    ink-2: "#c4c4c4"
    ink-3: "#8f8f8f"
    ink-4: "#696969"
    line: "#232323"
    line-strong: "#353535"
    inverse: "#f5f5f5"
    inverse-ink: "#0a0a0a"
    ok: "#4fbe85"
    warn: "#d9a320"
    danger: "#e8705a"
    frost: "#a6d4f2"
    frost-soft: "#5a97cf"
typography:
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
  data:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "12px"
  label:
    fontSize: "10.5px"
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  display:
    fontFamily: "'Bricolage Grotesque', -apple-system, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
radius:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  full: "999px"
space:
  scale: "4px base, steps 1 2 3 4 6 8 12 16 24"
  gutter: "20px"
  section: "32px"
elevation:
  flat: "none"
  raised: "0 1px 2px rgb(0 0 0 / .05), 0 1px 3px rgb(0 0 0 / .06)"
  overlay: "0 4px 12px rgb(0 0 0 / .08), 0 12px 32px rgb(0 0 0 / .10)"
  raised-dark: "0 1px 2px rgb(0 0 0 / .5), 0 1px 3px rgb(0 0 0 / .4)"
  overlay-dark: "0 4px 12px rgb(0 0 0 / .5), 0 12px 32px rgb(0 0 0 / .55)"
motion:
  fast: "120ms ease"
  soft: "180ms cubic-bezier(.2,.6,.3,1)"
  enter: "320ms cubic-bezier(.16,.84,.44,1)"
  exit: "160ms cubic-bezier(.4,0,1,1)"
  stagger: "40ms"
  breathe: "1.6s ease-in-out infinite"
  spinner: "0.9s linear infinite"
---

# Design System

An interface that is **monochrome but welcoming**. Neutral greys, light and dark themes, no accent colour: emphasis comes from contrast, weight and inversion. But sobriety is not dryness — the interface breathes, its surfaces are laid on one another by a soft shadow, its corners are rounded, its hierarchy reads at a glance. You should want to open it.

Three exceptions to monochrome, and only three: the **state** of things, the **logos of the services** the customer installs, in their original colours, and **the cold** that takes the last word of the site's headline. The rest is grey.

This document governs the desktop app, the web console and the site. One system, three surfaces.

## Tokens

A scale of neutral greys, with no tint. Four surface levels for elevation, four ink levels for hierarchy, two for lines, an inverted pair for the primary button, three state colours. The values are in the frontmatter; `packages/design` exposes them as CSS variables and as a Tailwind 4 preset.

| Token | Role |
| --- | --- |
| `base` | window or page background |
| `surface` | panels, sidebar, cards |
| `sunken` | fields, recessed areas, terminal |
| `raised` | hover, selected row, menus |
| `ink` | primary text |
| `ink-2` | secondary text |
| `ink-3` | labels, metadata |
| `ink-4` | disabled, placeholders |
| `line` | separators |
| `line-strong` | field borders, discreet focus |
| `inverse`, `inverse-ink` | primary button, strong badge: black on white in light, white on black in dark |
| `ok`, `warn`, `danger` | state dots, diff signs. Nothing else |
| `frost`, `frost-soft` | the word that cools down in the site's headline: the ink, then the frosted glass and the mist. Nothing else |

**Forbidden**: a hard-coded colour (`#`, `rgb()`, `oklch()`) in a component. Everything goes through a token.

## Rules

- **State is read from shape first.** Online: filled dot. Stopped: empty circle. Failed: crossed-out dot. In progress: breathing dot. Colour confirms; the interface stays legible in pure greys.
- **Elevation is a soft shadow, never a thick border.** Three levels only: `flat` for what is in the flow, `raised` for a card or a panel laid on the background, `overlay` for what floats — menu, popover, dialog. In the dark theme, the shadow is deeper and is doubled by a step of grey, the shadow alone not being enough there. A card carries a shadow **or** a line, never both pressed together.
- **Corners are rounded.** `xs` for a checkbox — at sixteen pixels, `sm` would draw a circle, and a circle is a radio button —, `sm` for a control, `md` for a card or a panel, `lg` for a dialog or a window, `xl` for the site's large surfaces — hero block, section card, logo tile —, `full` for a pill. A smaller radius than its parent when an element is nested.
- **A page's header is a band of its own.** In the app, the sidebar, the window strip and the page header — logo, label, title, state, facts, controls — share one `surface` closed by a line; the body is a `base` well that scrolls beneath them. What concerns the whole thing — go back, reread, remove — is done in the header; what concerns a section is done in the section. The onboarding, whose rail already says where we are, reads each step's header on the page itself.
- **Space makes the hierarchy.** 4 px scale. A 20 px gutter between blocks of the same group, 32 px between two sections. A section title has more air above than below. A dense list stays airy: 12 px of vertical padding minimum per row. Never squeeze to make things fit: cut or scroll.
- **Menus are ranked on three levels**: the group label in spaced capitals `ink-3`, entries in `ink`, the active entry on `raised` with a marker on the left. A separator before a destructive action. Never more than two levels of nesting.
- **Typography.** System font for the interface at 14 px in the app, 13 px in the console, 15 px on the site, where text is read from afar and without a keyboard. The app is read at arm's length on a large screen: it goes up a notch, and everything that lives beneath body text goes up with it. JetBrains Mono for any data: ports, paths, commands, durations, hashes, versions. Labels in spaced capitals at 10.5 px, 11.5 px in the app. Tabular figures wherever they align. Bricolage Grotesque for headings. Generous line height: 1.5 on body text, 1.2 on headings.
- **Interface icons**: Lucide, 1.5 px stroke, never filled, never coloured. An action button carries its icon before its label.
- **Service logos**: the real ones, as SVG, in their original colours. See the dedicated section.
- **Focus.** A two-pixel ring in `ink`, offset by two pixels. Visible on both themes.
- **Motion.** Five durations, and not one more. `fast` on backgrounds, lines and opacities; `soft` on what changes size or place without leaving the screen; `enter` on what arrives; `exit` on what leaves, always shorter than what arrives, because nobody waits for a goodbye; `stagger` as the interval between two siblings of the same cascade, eight at most, the ninth arriving with the eighth. Two looping animations, and not one more: `breathe` for an ongoing state — a pill, a phase, a skeleton — and `spinner` for a control that is working. Nothing under `prefers-reduced-motion`: the final screen appears at once, never a frozen intermediate state.
- **Motion says a direction.** A step forward enters from the right and leaves to the left, a return does the opposite: that is what teaches the reader where they are in a sequence of screens. Content that reveals itself rises by eight pixels while fading in, never more — beyond that, the interface starts to jump. A thing that changes state does not blink: it passes from one shape to the other. Nothing moves without a gesture, a response or a step having caused it: an interface at rest is still.
- **The terminal** keeps an ANSI palette, because Claude Code, Codex and the tools depend on it, but desaturated and adapted to each theme. Background `sunken`, cursor `ink`, selection `raised`. Around it, everything is monochrome.
- **The file editor** colours syntax with the same ANSI palette as the terminal, and nothing else: keyword magenta, definition and type blue, string green, literal in `warn` — the palette's amber does not hold contrast on the light theme — names in `ink`, comments and punctuation in the greys. The frame is the same as the terminal's.
- **The diff** marks lines by the sign and by an `ok` or `danger` background at 10% opacity. Legible without the colour.
- **A QR code is monochrome, and never alone.** Modules in `ink` on a `base` background, `sm` corners, no mark in the centre. The string it encodes is always displayed beside it in `font-data`: a reader that refuses the inverted contrast of the dark theme must never block the person.
- **Every gesture answers where it was made.** The first feedback of a click is on the clicked control, within a hundred milliseconds, and it stays there until the response is on screen: the button goes into waiting — the spinner in place of the icon, hence to the left of the label, `aria-busy`, the button unavailable and the cursor `progress` — and leaves it only once the result is rendered or the error displayed. A gesture that changes screen keeps its button waiting until the panel's exit begins, so that one sees the button respond then the screen leave. An unavailable control says why at its own height, never in a banner at the top of the page.
- **A screen that ends with a gesture carries that gesture at the bottom.** The last thing read is the last field; a bar stuck to the bottom of the page holds the action and, to its left, what opposes it. A header never carries the gesture that ends a form.
- **A bubble never carries what decides.** What decides — a required field, a reason for blocking, an error — is read without a gesture, under the field or under the card. The bubble carries the rest: where to find a value, what permissions a token asks for, what a mistake costs. It opens on click and on keyboard, never on hover alone, and its target is twenty-eight pixels.
- **The interface speaks to someone who has never opened a terminal.** It addresses the person formally (in French, *vous*), says what happens for the person and never how the app goes about it. Three planes: a title of a few words that says what is going on ("We are looking at the machine"), a sentence that says what it changes for them, and a collapsed "Details", closed by default, where the how lives — paths, protocols, checksums, channels, system accounts. The first two planes never use a word the person would not have used: no binary, probe, enrolment, standard input, heartbeat; we say the agent, we look, we declare, root access. A technical datum that decides — a port, an address, the command that repairs — stays visible, in `font-data`; one that decides nothing goes under Details.
- **Waiting screens say what is happening**: the title, what it changes, the phases named as the person would say them, the counter, the duration. Never a spinner alone, never the how outside Details.
- **Errors say the remedy**: what failed, why, the command or the button that repairs.
- **An alert is read from shape, and carries its remedy.** Crossed-out dot for what is broken — unreachable, disk full; empty circle for what is about to become so — outdated agent, licence in grace. The label says what is wrong, the line beneath says what to do. A list carries a banner that counts the active alerts and the affected servers; the record carries the detail. Never a red pill alone, never a counter without a remedy.
- **The public status page speaks only of the service.** Does the API answer, does the database answer, which agent version is published, how many servers are active — an aggregated counter, and nothing that names an organization, a person or a machine. It opens without a session, in a single card, with no chart or history.

## Accessibility

It is not a finishing pass: a screen that can only be read with the mouse and the eye is not finished.

- **Contrast.** Any text in `ink`, `ink-2` or `ink-3` holds 4.5:1 on `base`, `surface`, `sunken` and `raised`, in both themes. `ok`, `warn` and `danger` hold 4.5:1 on `base`, `surface` and `sunken`, and 3:1 on `raised`, which is only a hover. `ink-4` holds 3:1, and never carries information alone: a shape or a word says it too. Values are not judged by eye — `packages/design/src/contrast.test.ts` computes each pair.
- **Focus.** The ring everywhere. On a change of screen or sub-step, focus goes to the step's title, so that a screen reader says where we arrive and tabbing restarts from the top of the work. After a refusal, it goes to the first faulty field.
- **Announcements.** Two live regions in the shell: `polite` for what happened — a step crossed, a module installed, a connection recovered — and `assertive` for what stopped. An installation counter goes through there per module, never per step.
- **Forms.** `aria-required`, `aria-invalid`, `aria-describedby` toward the help, the bubble and the refusal. The refusal is a line under the field, with its identifier; the count of problems is a link to the first.
- **Keyboard.** Everything that clicks tabs and activates with Enter and Space. A bubble closes with Escape.
- **Targets.** Twenty-eight pixels minimum for what clicks, whatever the glyph size.
- **Motion.** Nothing under `prefers-reduced-motion`, a button's waiting included: it becomes a glyph change, with no breathing.

## Service logos

The catalogue, the Services screen and the project cards show **the real logo** of each service, as SVG, in its original colours: PostgreSQL, MySQL, MongoDB, Redis, Node.js, Bun, Python, Java, Go, Docker, GitHub, 1Password, Cloudflare, JetBrains, VS Code, Zed, Claude, Codex, Nous Research, Neon, Caddy, and each of the others. It is what makes the catalogue list legible at a glance, and what gives the interface its warmth without betraying the monochrome of the rest.

- **Where they live**: `packages/design/src/logos/<id>.svg`, one file per catalogue module, named by the module's identifier (`db.postgres` → `db-postgres.svg`). They are **inline fragments**, without a namespace declaration: they are meant to be inserted into the document, never loaded by an `<img>`. One `ServiceLogo` component per surface renders them at fixed size (16, 20, 24, 32 px), with an accessible `title`.
- **Provenance**: Simple Icons when the brand is there (CC0), otherwise the rights holder's SVG as a collector republishes it, [svgl](https://svgl.app) or [lobehub](https://lobehub.com/icons) — the original file is committed under `packages/design/scripts/vendor`, and the generator reduces it to what the app inlines: one root, a `viewBox`, a title, prefixed identifiers so two logos placed side by side do not paint each other. A `packages/design/src/logos/NOTICE.md` file lists for each logo its source, its licence and the date, and separates CC0 paths from those that remain a registered trademark. Nominative use: we name software we install, which is lawful; we never use it to suggest a partnership.
- **Treatment**: the logo keeps its colours, without filter or tint, set on a `surface` pill with `sm` corners. A logo that is monochrome by nature (GitHub, Zed) takes `ink` and so follows the theme. No logo is distorted, cropped or recoloured.
- **A brand outside the catalogue** — a product a module installs under another name, like Bun in `runtime.node` — lives in the same folder under `mark-<id>.svg`, served by `markFor`. The site uses it to name what Pupitre installs; the rest of the product displays only module logos.
- **Forbidden**: a logo as an action icon, in a button, or as a watermark behind text.
- **One exception, on the site only**: a constellation of logos floats in the margins of the hero block and the final call, outside the text column, on the usual pill, at full opacity and without tint. It is decorative — `aria-hidden`, with no readable name — and disappears below 1280 px, where the margin no longer exists. It does not replace the named wall that follows: that is where the services are read.
- **No lawful logo, no invented logo.** Three modules have no brand to show: `core.system`, `core.hardening` and `core.backup` name no product, and `EXEMPTIONS` of `packages/design/src/logos/index.ts` says so for each. The fallback must be as polished as the others: a Lucide icon in the app and the console, a monogram on the site.

## Terminal ANSI palette

| | Light | Dark |
| --- | --- | --- |
| black / brightBlack | `#0a0a0a` / `#767676` | `#0a0a0a` / `#5c5c5c` |
| red / brightRed | `#b3362a` / `#c94b3f` | `#e8705a` / `#ff8a72` |
| green / brightGreen | `#1f7a45` / `#2f9457` | `#4fbe85` / `#6fd9a0` |
| yellow / brightYellow | `#9a6a00` / `#b98200` | `#d9a320` / `#f0bc3c` |
| blue / brightBlue | `#2f5f8f` / `#3f75ab` | `#7aa2c8` / `#96bde0` |
| magenta / brightMagenta | `#7a4f78` / `#95648f` | `#c88ec0` / `#dfa8d7` |
| cyan / brightCyan | `#2f7a76` / `#3f9490` | `#6fb5b0` / `#8dd0cb` |
| white / brightWhite | `#4a4a4a` / `#0a0a0a` | `#c4c4c4` / `#f5f5f5` |

## Implementation

- `packages/design/src/tokens.css` declares the tokens under `:root` (light), redefines them under `:root[data-theme="dark"]` and under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`. Shadows, radii, the space scale and durations are tokens on a par with colours (`--shadow-raised`, `--radius-md`, `--space-4`, `--motion-soft`), and the dark theme redefines the shadows. `packages/design/src/tailwind.css` exposes them to Tailwind 4's `@theme` (`--color-base`, `--radius-md`, `--shadow-overlay`…). `packages/design/src/tokens.ts` gives the TypeScript version for Electron's main process.
- `packages/design/src/tailwind.css` exposes motion as utilities — `transition-fast`, `transition-soft`, `animate-enter`, `animate-breathe`, `animate-spinner` — built on the `--motion-*` tokens. No exit utility is shared: `--motion-exit` serves directly for the desktop app's view exits (`leave-forward`, `leave-back` in its `styles.css`). A component never writes a duration by hand.
- Text sizes are a named scale, `text-caption` · `text-small` · `text-control` · `text-body` · `text-heading` · `text-title`, on the `--font-*-size` tokens that each surface can raise by a notch. A component never writes a size by hand (`text-[12px]`); display headings keep Tailwind's scale.
- A `packages/design` test computes the contrast ratios of each ink on each surface, in both themes, and fails if a frontmatter value falls below its floor. An ink therefore does not lighten without the suite saying so.
- The display font is embedded, not loaded: `packages/design/src/fonts/` carries the woff2 as a Latin subset of the single weight used, its provenance and its licence (SIL OFL 1.1), and `@pupitre/design/fonts.css` declares it. The desktop app imports it, and therefore renders the same offline.
- The theme choice (`system`, `light`, `dark`) lives with the desktop app's browsing preferences, in the console's `localStorage`, and in a cookie for the site. The xterm theme switches with it.
- The brand is the `>_` glyph in a square with `md` corners: black on white in light, white on black in dark. It is **defined once**, in `packages/design/src/brand/index.ts`: the geometry on a 1024 grid, the two colour pairs, a small optical size for below twenty-four pixels, and an SVG builder. The Electron app icon (`bun --cwd=apps/desktop run icons`), the site favicon and the brand kit all derive from it, and a site test forbids the favicon from diverging.
- **The brand kit** is an artefact, not a source: `bun --cwd=packages/design run brand` writes into `packages/design/dist/brand/` everything the brand needs outside the apps — both versions of the square as SVG and as PNG from 16 to 1024, the horizontal and vertical lockups with "Pupitre" vectorised, the lone glyphs, `favicon.ico`, the files for Stripe, the social avatar, the Open Graph card, the macOS, Windows, iOS and PWA icons. Its `README.md` says which file goes where.
- Console and app components: Base UI + shadcn/ui on Tailwind 4, `render` prop (never `asChild`), one component per file. The site uses the same tokens in Astro without a component library.
