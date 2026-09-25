import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  actOnProject,
  checkoutProject,
  diffProject,
  forgetProjects,
  listProjects,
  onProject,
  type ProjectDeps,
  projectFolder,
} from "../projects-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "srv-1";

let fake: FakeAgent | null = null;

function deps(): ProjectDeps {
  fake = fakeAgent(["project-git-control.jsonl", "project-git-work.jsonl"]);

  const client: AgentClient = createAgentClient({
    backoff: { attempts: 1 },
    spawn: fake.spawn,
  });

  return { client, knows: (id) => id === SERVER };
}

beforeEach(() => {
  forgetProjects();
});

afterEach(() => {
  fake?.killAll();
  fake = null;
  forgetProjects();
});

describe("les commandes d'un projet ouvert", () => {
  it("refuse un projet que l'agent n'a jamais déclaré", async () => {
    const answer = await onProject(
      "project.git_status",
      SERVER,
      "inconnu",
      deps()
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "project_not_found" },
    });
  });

  it("refuse un serveur qui n'est plus dans la liste", async () => {
    const answer = await listProjects("srv-parti", deps());

    expect(answer).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  it("lit les branches, l'écart distant, l'arbre et un diff", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);

    const branches = await onProject(
      "project.branches",
      SERVER,
      "flyleaf-api",
      shared
    );
    const git = await onProject(
      "project.git_status",
      SERVER,
      "flyleaf-api",
      shared
    );
    const tree = await onProject(
      "project.working_tree",
      SERVER,
      "flyleaf-api",
      shared
    );
    const diff = await diffProject(SERVER, "flyleaf-api", "src/tva.ts", shared);

    expect(branches).toMatchObject({ ok: true, result: { current: "main" } });
    expect(git).toMatchObject({ ok: true, result: { behind: 3 } });
    expect(tree).toMatchObject({ ok: true, result: { files: [{ added: 2 }] } });
    expect(diff).toMatchObject({ ok: true, result: { path: "src/tva.ts" } });
  });

  it("préfère la racine que git a nommée au dossier du registre", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);

    // In this fixture the repository sits one level above the registry folder.
    expect(projectFolder(SERVER, "flyleaf-api")).toBe(
      "/home/dev/projects/flyleaf/api"
    );

    await onProject("project.branches", SERVER, "flyleaf-api", shared);
    await onProject("project.git_status", SERVER, "flyleaf-api", shared);

    expect(projectFolder(SERVER, "flyleaf-api")).toBe(
      "/home/dev/projects/flyleaf"
    );
  });

  it("transmet le refus de l'agent et son remède, sans les toucher", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);
    await onProject("project.branches", SERVER, "flyleaf-api", shared);
    await onProject("project.git_status", SERVER, "flyleaf-api", shared);
    await onProject("project.working_tree", SERVER, "flyleaf-api", shared);
    await diffProject(SERVER, "flyleaf-api", "src/tva.ts", shared);

    const answer = await checkoutProject(
      SERVER,
      "flyleaf-api",
      "feat/tarifs",
      shared
    );

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "bad_request",
        fix: "Commite ou remise tes changements, puis réessaie.",
      },
    });
  });

  it("refuse un nom de branche que le serveur n'aurait pas pu donner", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);

    const answer = await checkoutProject(
      SERVER,
      "flyleaf-api",
      "main; rm -rf /",
      shared
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    });
  });

  it("refuse une action qui n'est pas une des trois", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);

    const answer = await actOnProject(
      "project.destroy",
      SERVER,
      "flyleaf-api",
      null,
      shared
    );

    expect(answer).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });
});
