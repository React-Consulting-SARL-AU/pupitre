import { describe, expect, it } from "bun:test";
import type { AgentState, ProjectState } from "@shared/contract";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentDot } from "../AgentDot";
import { StatusPill } from "../StatusPill";

/**
 * The rendering harness is `react-dom/server`: these components have no state,
 * no effect and no DOM API, so a static render says everything a browser would,
 * without pulling a DOM into `bun test`.
 */

const PROJECT_STATES: ProjectState[] = [
  "online",
  "service",
  "external",
  "starting",
  "failed",
  "down",
  "stopped",
];

const AGENT_STATES: AgentState[] = [
  "working",
  "attention",
  "idle",
  "asleep",
  "finished",
];

const COLOUR_CLASS =
  /\b(?:text|bg|border|fill|stroke|ring|divide)-(?:ok|warn|danger|inverse-ink|inverse|ink-2|ink-3|ink-4|ink|line-strong|line|base|surface|sunken|raised)(?:\/\d+)?\b/g;
const TONE_ATTRIBUTE = /\sdata-tone="[^"]*"/g;
const STATE_ATTRIBUTE = /\sdata-state="[^"]*"/g;

/**
 * What is left of the markup once every colour is gone.
 *
 * Both the token classes and the `data-tone` hook go, so whatever still tells
 * two states apart is their outline, their glyph or their word — which is the
 * rule: the interface stays readable in pure greys.
 */
function greyscale(html: string): string {
  return html.replace(COLOUR_CLASS, "").replace(TONE_ATTRIBUTE, "");
}

function shapeOf(html: string): string {
  return html.match(/data-shape="([^"]*)"/)?.[1] ?? "";
}

describe("project states", () => {
  it("stay distinguishable with every colour stripped", () => {
    const rendered = PROJECT_STATES.map((state) =>
      greyscale(
        renderToStaticMarkup(<StatusPill state={state} />).replace(
          STATE_ATTRIBUTE,
          ""
        )
      )
    );

    expect(new Set(rendered).size).toBe(PROJECT_STATES.length);
  });

  it("draw a filled dot online, a hollow one stopped, a struck one failed", () => {
    const shapes = Object.fromEntries(
      PROJECT_STATES.map((state) => [
        state,
        shapeOf(renderToStaticMarkup(<StatusPill state={state} />)),
      ])
    );

    expect(shapes.online).toBe("filled");
    expect(shapes.stopped).toBe("empty");
    expect(shapes.failed).toBe("struck");
    expect(shapes.down).toBe("struck");
    expect(shapes.starting).toBe("breathing");
  });

  it("breathes only while something is starting", () => {
    const breathing = PROJECT_STATES.filter((state) =>
      renderToStaticMarkup(<StatusPill state={state} />).includes(
        'class="breathe"'
      )
    );

    expect(breathing).toEqual(["starting"]);
  });
});

describe("agent states", () => {
  it("stay distinguishable with every colour stripped", () => {
    const rendered = AGENT_STATES.map((state) =>
      greyscale(renderToStaticMarkup(<AgentDot state={state} />))
    );

    expect(new Set(rendered).size).toBe(AGENT_STATES.length);
  });

  it("gives each state an outline of its own", () => {
    const shapes = AGENT_STATES.map((state) =>
      shapeOf(renderToStaticMarkup(<AgentDot state={state} />))
    );

    expect(new Set(shapes).size).toBe(AGENT_STATES.length);
  });

  it("marks a failed-looking state with a stroke, not a colour", () => {
    const finished = renderToStaticMarkup(<AgentDot state="finished" />);
    const idle = renderToStaticMarkup(<AgentDot state="idle" />);

    expect(finished).toContain("<line");
    expect(idle).not.toContain("<line");
  });

  it("names what it shows, for a reader who sees no shape at all", () => {
    const attention = renderToStaticMarkup(<AgentDot state="attention" />);

    expect(attention).toContain('aria-label="waiting for your answer"');
  });
});
