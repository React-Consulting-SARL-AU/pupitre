import { afterEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { type Mounted, mount } from "../../__tests__/dom";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { JournalPane } from "../ui/journal-pane";

const ROWS = [
  { id: 1, text: "=== pupitre up 2026-09-18T10:00:05Z ===" },
  { id: 2, text: "ready on https://atlas.example.com/ (dev)" },
  { id: 3, text: "" },
  { id: 4, text: "=== pupitre down 2026-09-18T10:02:00Z ===" },
  { id: 5, text: "=== pupitre up 2026-09-18T10:02:03Z ===" },
  { id: 6, text: "ready again" },
];

let view: Mounted | null = null;

afterEach(() => {
  view?.unmount();
  view = null;
});

describe("the journal frame", () => {
  it("draws a start, a stop and then a restart as rules, and everything else as lines", async () => {
    view = await mount(
      <JournalPane
        follow={true}
        label="journal de atlas"
        onFollowChange={() => undefined}
        rows={ROWS}
      />
    );

    const marks = [...view.container.querySelectorAll("[data-journal-mark]")];

    expect(marks.map((mark) => mark.getAttribute("data-journal-mark"))).toEqual(
      ["up", "down", "restart"]
    );
    expect(view.text()).toContain("Processus démarré à");
    expect(view.text()).toContain("Processus arrêté à");
    expect(view.text()).toContain("Processus redémarré à");
    expect(view.text()).not.toContain("=== pupitre");
    expect(view.text()).toContain("ready again");
  });

  it("opens an address externally without navigating", async () => {
    const opened: string[] = [];

    stubPupitre({
      openUrl: (url: string) => {
        opened.push(url);

        return Promise.resolve();
      },
    });

    view = await mount(
      <JournalPane
        follow={true}
        label="journal de atlas"
        onFollowChange={() => undefined}
        rows={ROWS}
      />
    );

    const link = view.container.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://atlas.example.com/");
    expect(link?.textContent).toBe("https://atlas.example.com/");

    await view.click(link);

    expect(opened).toEqual(["https://atlas.example.com/"]);
  });

  it("releases the tail as soon as the pointer rests on a line, not on a link", async () => {
    const changes: boolean[] = [];

    view = await mount(
      <JournalPane
        follow={true}
        label="journal de atlas"
        onFollowChange={(next) => changes.push(next)}
        rows={ROWS}
      />
    );

    const line = view.container.querySelector("[role='log'] > div");
    const link = view.container.querySelector("a");

    await act(async () => {
      link?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      line?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });

    expect(changes).toEqual([false]);
  });
});
