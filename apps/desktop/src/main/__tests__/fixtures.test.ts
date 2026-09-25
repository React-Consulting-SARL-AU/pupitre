import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import { COMMANDS, isCommandName } from "@pupitre/shared/agent-protocol";
import {
  EventSchema,
  LogEventSchema,
  RequestSchema,
  ResponseSchema,
  StepEventSchema,
} from "@pupitre/shared/agent-protocol/envelope";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

const COVERAGE = 20;

/** Structural, so the app does not depend on zod. */
interface Weighs {
  safeParse: (value: unknown) => {
    success: boolean;
    error?: { message: string };
  };
}

interface Line {
  at: number;
  way: ">" | "<";
  body: Record<string, unknown>;
}

/** `#` comments and `@directives` drive the fake machine, not the protocol, and are skipped. */
function exchanges(file: string): Line[] {
  return readFileSync(join(FIXTURES, file), "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const trimmed = line.trim();

      if (!(trimmed.startsWith("> ") || trimmed.startsWith("< "))) {
        return [];
      }

      return [
        {
          at: index + 1,
          body: JSON.parse(trimmed.slice(2)) as Record<string, unknown>,
          way: trimmed[0] as ">" | "<",
        },
      ];
    });
}

function against(line: Line, schema: Weighs, value: unknown): string {
  const parsed = schema.safeParse(value);

  return parsed.success ? "" : `line ${line.at}: ${parsed.error?.message}`;
}

function eventSchema(name: unknown): Weighs {
  if (name === "step") {
    return StepEventSchema;
  }

  return name === "log" ? LogEventSchema : EventSchema;
}

const files = readdirSync(FIXTURES).filter((name) => name.endsWith(".jsonl"));

describe("les transcriptions du faux agent", () => {
  it("en couvre assez pour que cette garde veuille dire quelque chose", () => {
    expect(files.length).toBeGreaterThan(COVERAGE);
  });

  for (const file of files) {
    it(`${file} ne tient que des échanges du protocole`, () => {
      const asked = new Map<number, CommandName>();

      for (const line of exchanges(file)) {
        const id = line.body.id as number;

        if (line.way === ">") {
          expect(against(line, RequestSchema, line.body)).toBe("");

          const { cmd, params } = line.body as {
            cmd: string;
            params?: unknown;
          };

          expect(`line ${line.at}: ${isCommandName(cmd) ? "" : cmd}`).toBe(
            `line ${line.at}: `
          );

          if (!isCommandName(cmd)) {
            continue;
          }

          asked.set(id, cmd);

          // "*" is a transcript matcher for any value, not a payload to weigh.
          if (!JSON.stringify(params ?? {}).includes('"*"')) {
            expect(against(line, COMMANDS[cmd].params, params ?? {})).toBe("");
          }

          continue;
        }

        if ("event" in line.body) {
          expect(against(line, eventSchema(line.body.event), line.body)).toBe(
            ""
          );

          continue;
        }

        expect(against(line, ResponseSchema, line.body)).toBe("");

        const cmd = asked.get(id);

        if (cmd && line.body.ok === true) {
          expect(against(line, COMMANDS[cmd].result, line.body.result)).toBe(
            ""
          );
        }
      }
    });
  }
});
