import { describe, expect, it } from "bun:test";
import { REMOTE_EDITORS } from "@shared/editors";
import type { Server } from "@shared/servers";
import { act } from "react";
import { mount, typeInto } from "../../__tests__/dom";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { OnboardingServerChoice } from "../onboarding/onboarding-server-choice";
import { ProjectActions } from "../projects/project-actions";
import { ProjectBranches } from "../projects/project-branches";
import { ProjectEditorButton } from "../projects/project-editor-button";
import { ProjectProcessRow } from "../projects/project-process-row";

const NEVER = () => new Promise<void>(() => undefined);

const PROJECT = SNAPSHOT.projects[0];

const SERVER: Server = {
  host: "203.0.113.10",
  id: "srv-1",
  name: "atelier",
  origin: "app",
  port: 22,
  user: "dev",
};

function busy(button: Element | null | undefined): string | null {
  return button?.getAttribute("aria-busy") ?? null;
}

describe("a long gesture keeps its button pending", () => {
  it("starts or restarts a project", async () => {
    if (!PROJECT) {
      throw new Error("the snapshot fixture names no project");
    }

    const view = await mount(
      <ProjectActions
        busy={false}
        editors={null}
        onAct={NEVER}
        onRemove={NEVER}
        onSync={() => undefined}
        project={PROJECT}
        syncing={false}
      />
    );
    const start = view.container.querySelector("button");

    await view.click(start);

    expect(busy(start)).toBe("true");

    view.unmount();
  });

  it("starts or stops a process", async () => {
    const process = PROJECT?.processes[0];

    if (!process) {
      throw new Error("the snapshot fixture names no process");
    }

    const view = await mount(
      <ul>
        <ProjectProcessRow busy={false} onAct={NEVER} process={process} />
      </ul>
    );
    const start = view.container.querySelector("button");

    await view.click(start);

    expect(busy(start)).toBe("true");

    view.unmount();
  });

  it("creates a branch without closing the form before the response", async () => {
    const view = await mount(
      <ProjectBranches
        folder="/home/dev/projects/flyleaf"
        onCheckout={NEVER}
        state={{
          branches: {
            current: "main",
            dirty: false,
            local: ["main"],
            remote: [],
            repo: true,
            root: "/home/dev/projects/flyleaf",
          },
          status: "read",
        }}
        switching={false}
      />
    );

    await view.click(
      [...view.container.querySelectorAll("button")].find(
        (button) => button.textContent === "Nouvelle branche"
      ) ?? null
    );
    await typeInto(
      view.container.querySelector("#project-branch-new"),
      "feature/login"
    );
    await act(() => {
      view.container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });

    expect(view.container.querySelector("[data-branch-create]")).not.toBeNull();

    view.unmount();
  });

  it("opens an editor", async () => {
    const editor = REMOTE_EDITORS[0];

    if (!editor) {
      throw new Error("no remote editor is declared");
    }

    const view = await mount(
      <ProjectEditorButton
        editor={editor}
        onOpen={NEVER}
        onShare={NEVER}
        root="/home/dev/projects/flyleaf"
        share={null}
      />
    );
    const open = view.container.querySelector("button");

    await view.click(open);

    expect(busy(open)).toBe("true");

    view.unmount();
  });

  it("picks a known server in the onboarding", async () => {
    const view = await mount(
      <OnboardingServerChoice onPick={NEVER} server={SERVER} />
    );
    const card = view.container.querySelector("button");

    await view.click(card);

    expect(busy(card)).toBe("true");

    view.unmount();
  });
});
