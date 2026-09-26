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

describe("un processus dont l'environnement a changé", () => {
  it("dit qu'un redémarrage applique les nouvelles valeurs", async () => {
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

  it("ne dit rien tant que rien n'a changé", async () => {
    const view = await mount(
      <ul>
        <ProjectProcessRow busy={false} onAct={NEVER} process={declared()} />
      </ul>
    );

    expect(view.container.querySelector("[data-env-changed]")).toBeNull();

    view.unmount();
  });
});
