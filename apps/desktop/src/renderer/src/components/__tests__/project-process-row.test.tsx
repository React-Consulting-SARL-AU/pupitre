import { describe, expect, it } from "bun:test";
import { mount } from "../../__tests__/dom";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { ProjectProcessRow } from "../projects/project-process-row";

const NEVER = () => new Promise<void>(() => undefined);

function declared() {
  const process = SNAPSHOT.projects[0]?.processes[0];

  if (!process) {
    throw new Error("the snapshot fixture names no process");
  }

  return process;
}

describe("a process left starting", () => {
  it("can be stopped or restarted", async () => {
    const view = await mount(
      <ul>
        <ProjectProcessRow
          busy={false}
          onAct={NEVER}
          process={{ ...declared(), state: "starting" }}
        />
      </ul>
    );

    const labels = [...view.container.querySelectorAll("button")].map(
      (button) => button.textContent
    );

    view.unmount();

    expect(labels).toEqual(["Redémarrer", "Arrêter"]);
  });
});

describe("a process whose environment changed", () => {
  it("says a restart applies the new values", async () => {
    const view = await mount(
      <ul>
        <ProjectProcessRow
          busy={false}
          onAct={NEVER}
          process={{ ...declared(), env_changed: true, state: "online" }}
        />
      </ul>
    );

    expect(
      view.container.querySelector("[data-env-changed]")?.textContent
    ).toContain("PUPITRE_*");

    view.unmount();
  });

  it("says nothing while nothing has changed", async () => {
    const view = await mount(
      <ul>
        <ProjectProcessRow busy={false} onAct={NEVER} process={declared()} />
      </ul>
    );

    expect(view.container.querySelector("[data-env-changed]")).toBeNull();
    expect(view.container.querySelector("[data-held-by]")).toBeNull();

    view.unmount();
  });
});

describe("a process whose port another project holds", () => {
  it("names the holder, and the span it reserves", async () => {
    const process = {
      ...declared(),
      held_by: "react-box/web",
      port_span: 10,
      state: "stopped" as const,
    };
    const view = await mount(
      <ul>
        <ProjectProcessRow busy={false} onAct={NEVER} process={process} />
      </ul>
    );

    expect(
      view.container.querySelector("[data-held-by]")?.textContent
    ).toContain(`Le port ${process.port} est tenu par react-box/web`);
    expect(view.container.textContent).toContain(
      `${process.port}–${process.port + 9}`
    );

    view.unmount();
  });
});
