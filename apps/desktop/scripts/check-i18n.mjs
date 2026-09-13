#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = join(HERE, "..", "src", "renderer", "src");
const MAIN = join(HERE, "..", "src", "main");

const ACCENT = /[àâäçéèêëîïôöùûüÿœæ°€’“”«»À-ÖØ-Þ]/u;

const COPY_ATTRS = [
  "title",
  "detail",
  "note",
  "help",
  "label",
  "description",
  "eyebrow",
  "placeholder",
  "retryLabel",
  "summary",
  "heading",
  "confirmLabel",
  "cancelLabel",
  "aria-label",
  "alt",
];

const COPY_ATTR_RE = new RegExp(
  `\\b(?:${COPY_ATTRS.join("|")})\\s*=\\s*\\{?\\s*(["'])((?:\\\\.|(?!\\1).)*?[A-Za-z](?:\\\\.|(?!\\1).)*?)\\1`,
  "g"
);

const JSX_TEXT_RE =
  /(?<![=<>/])>\s*([^<>{}()\n;=]*?[A-Za-z][^<>{}()\n;=]*?)\s*</g;

const JSX_TEXT_ALLOW = new Set([
  "px",
  "px.",
  "Claude",
  "Codex",
  "Copilot",
  "Cursor",
  "Gemini",
  "OpenCode",
  "Pupitre",
]);

const UNITS = ["octets?", "[KMGT]o", "[KMG]io", "[KMGT]B", "[KMG]iB"];

const UNIT_RE = new RegExp(`(?<!\\w)(?:${UNITS.join("|")})(?!\\w)`, "g");

const DECIMAL_MARK_RE = /\.replace\(\s*(["'])\.\1\s*,\s*(["']),\2\s*\)/g;

/** The one place a unit word and a decimal mark are assembled, per locale. */
const FORMATTER = "src/renderer/src/lib/format.ts";

const SOURCE_FILE = /\.tsx?$/;

const TOKEN_RE = /\S+/g;

function isSkipped(path) {
  return (
    path.includes("/i18n/") ||
    path.endsWith("/dialogs.ts") ||
    path.includes("__tests__") ||
    path.endsWith(".d.ts")
  );
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_FILE.test(full) && !isSkipped(full)) {
      out.push(full);
    }
  }
}

/**
 * The source with comments removed, in two projections. `masked` keeps string
 * and JSX text, so an accent left in copy is still seen; `codeOnly` also blanks
 * quoted and templated bodies, so a JSX text node is read on its own rather than
 * a string literal's contents standing in for one. Blanking keeps offsets, so a
 * match still maps back to its line.
 */
class Projection {
  constructor(source) {
    this.source = source;
    this.masked = [];
    this.codeOnly = [];
    this.strings = [];
  }

  keep(ch, inString) {
    this.masked.push(ch);

    if (ch === "\n") {
      this.codeOnly.push("\n");
      this.strings.push("\n");
    } else {
      this.codeOnly.push(inString ? " " : ch);
      this.strings.push(inString ? ch : " ");
    }
  }

  drop(ch) {
    const soft = ch === "\n" ? "\n" : " ";

    this.masked.push(soft);
    this.codeOnly.push(soft);
    this.strings.push(soft);
  }

  comment(from, isBlock) {
    let i = from + 2;
    const closes = () =>
      isBlock
        ? this.source[i] === "*" && this.source[i + 1] === "/"
        : this.source[i] === "\n";

    this.drop(this.source[from]);
    this.drop(this.source[from + 1]);

    while (i < this.source.length && !closes()) {
      this.drop(this.source[i]);
      i++;
    }

    if (isBlock && i < this.source.length) {
      this.drop(this.source[i]);
      this.drop(this.source[i + 1]);
      i += 2;
    }

    return i;
  }

  quoted(from) {
    const quote = this.source[from];
    let i = from + 1;

    this.keep(quote, false);

    while (i < this.source.length && this.source[i] !== quote) {
      if (this.source[i] === "\\") {
        this.keep(this.source[i], true);
        this.keep(this.source[i + 1] ?? "", true);
        i += 2;
        continue;
      }

      this.keep(this.source[i], true);
      i++;
    }

    if (i < this.source.length) {
      this.keep(quote, false);
      i++;
    }

    return i;
  }

  run() {
    let i = 0;
    const n = this.source.length;

    while (i < n) {
      const ch = this.source[i];
      const next = this.source[i + 1];

      if (ch === "/" && (next === "/" || next === "*")) {
        i = this.comment(i, next === "*");
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        i = this.quoted(i);
        continue;
      }

      this.keep(ch, false);
      i++;
    }

    return {
      masked: this.masked.join(""),
      codeOnly: this.codeOnly.join(""),
      strings: this.strings.join(""),
    };
  }
}

function lineOf(text, index) {
  let line = 1;

  for (let k = 0; k < index; k++) {
    if (text[k] === "\n") {
      line++;
    }
  }

  return line;
}

function scan(file) {
  const source = readFileSync(file, "utf8");
  const { masked, codeOnly, strings } = new Projection(source).run();
  const isTsx = file.endsWith(".tsx");
  const formats = file.endsWith(FORMATTER);
  const violations = [];

  for (const match of masked.matchAll(TOKEN_RE)) {
    if (ACCENT.test(match[0])) {
      violations.push({
        line: lineOf(masked, match.index),
        why: "accented copy",
        text: match[0].slice(0, 60),
      });
    }
  }

  for (const match of masked.matchAll(COPY_ATTR_RE)) {
    violations.push({
      line: lineOf(masked, match.index),
      why: "copy attribute",
      text: match[2].trim().slice(0, 60),
    });
  }

  for (const match of isTsx ? codeOnly.matchAll(JSX_TEXT_RE) : []) {
    const text = match[1].trim();

    if (text && !JSX_TEXT_ALLOW.has(text)) {
      violations.push({
        line: lineOf(codeOnly, match.index),
        why: "jsx text",
        text: text.slice(0, 60),
      });
    }
  }

  for (const match of formats ? [] : strings.matchAll(UNIT_RE)) {
    violations.push({
      line: lineOf(strings, match.index),
      why: "hard-coded unit",
      text: match[0],
    });
  }

  for (const match of formats ? [] : masked.matchAll(DECIMAL_MARK_RE)) {
    violations.push({
      line: lineOf(masked, match.index),
      why: "hard-coded decimal mark",
      text: match[0],
    });
  }

  return violations;
}

function main() {
  const files = [];
  walk(RENDERER, files);
  // The main process no longer phrases anything: it names a dictionary entry.
  walk(MAIN, files);

  const found = [];

  for (const file of files) {
    for (const violation of scan(file)) {
      found.push({ file, ...violation });
    }
  }

  if (found.length === 0) {
    process.stdout.write("check-i18n: no hard-coded interface strings\n");
    return;
  }

  found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  for (const v of found) {
    const rel = relative(join(HERE, ".."), v.file);
    process.stderr.write(`${rel}:${v.line}  [${v.why}]  ${v.text}\n`);
  }

  process.stderr.write(
    `\ncheck-i18n: ${found.length} hard-coded interface string(s); move them into src/renderer/src/i18n\n`
  );
  process.exit(1);
}

main();
