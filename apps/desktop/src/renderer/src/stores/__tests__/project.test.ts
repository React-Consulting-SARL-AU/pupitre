import { beforeEach, describe, expect, it } from "bun:test";
import type {
  ProjectBranchesResult,
  ProjectGitStatusResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import {
  BRANCHES,
  GIT_STATUS,
  WORKING_TREE,
} from "../../__tests__/snapshot-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useProject } from "../project";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

/** One project's answers, each landing when the test says so. */
interface Answers {
  branches: Deferred<ProjectBranchesResult>;
  git: Deferred<ProjectGitStatusResult>;
  tree: Deferred<ProjectWorkingTreeResult>;
}

function project(): Answers {
  return { branches: deferred(), git: deferred(), tree: deferred() };
}

function ok<T>(pending: Promise<T>) {
  return pending.then((result) => ({ ok: true as const, result }));
}

function agent(projects: Record<string, Answers>): void {
  const of = (name: string): Answers => {
    const answers = projects[name];

    if (!answers) {
      throw new Error(`${name} is not a project of this test`);
    }

    return answers;
  };

  stubPupitre({
    projectBranches: (_serverId, name) => ok(of(name).branches.promise),
    projectGitStatus: (_serverId, name) => ok(of(name).git.promise),
    projectWorkingTree: (_serverId, name) => ok(of(name).tree.promise),
  });
}

beforeEach(() => {
  useProject.getState().close();
});

describe("une réponse tardive d'un projet quitté", () => {
  it("ne se pose pas sur le projet ouvert depuis", async () => {
    const a = project();
    const b = project();
    agent({ a, b });

    const slow = useProject.getState().open("srv", "a");
    const fast = useProject.getState().open("srv", "b");

    b.branches.resolve({ ...BRANCHES, current: "b-branch" });
    b.git.resolve({ ...GIT_STATUS, subject: "b-commit" });
    await fast;

    a.branches.resolve({ ...BRANCHES, current: "a-branch" });
    a.git.resolve({ ...GIT_STATUS, subject: "a-commit" });
    await slow;

    const { name, branches, git } = useProject.getState();

    expect(name).toBe("b");
    expect(branches).toMatchObject({
      branches: { current: "b-branch" },
      status: "read",
    });
    expect(git).toMatchObject({ git: { subject: "b-commit" }, status: "read" });
  });

  it("ne repeint pas l'arbre d'un projet fermé", async () => {
    const a = project();
    agent({ a });

    useProject.setState({ name: "a" });

    const slow = useProject.getState().readTree("srv", "a");

    useProject.getState().close();
    a.tree.resolve(WORKING_TREE);
    await slow;

    expect(useProject.getState().tree).toEqual({ status: "idle" });
  });
});

describe("l'ouverture d'un projet", () => {
  it("lit ses branches et son écart, et les garde tels quels", async () => {
    const a = project();
    agent({ a });

    const opening = useProject.getState().open("srv", "a");

    expect(useProject.getState().git).toEqual({ status: "reading" });
    expect(useProject.getState().branches).toEqual({ status: "reading" });

    a.branches.resolve(BRANCHES);
    a.git.resolve(GIT_STATUS);
    await opening;

    expect(useProject.getState().branches).toEqual({
      branches: BRANCHES,
      status: "read",
    });
    expect(useProject.getState().git).toMatchObject({
      git: GIT_STATUS,
      status: "read",
    });
  });
});

describe("le fichier d'environnement", () => {
  it("garde les clés, jamais une valeur, et réécrit quand on force", async () => {
    const forced: boolean[] = [];

    stubPupitre({
      projectEnv: (_serverId: string, _name: string, force = false) => {
        forced.push(force);

        return Promise.resolve({
          ok: true,
          result: {
            keys: ["DATABASE_URL"],
            path: "/home/dev/projects/a/.env.local",
            template: true,
            written: force,
          },
        });
      },
    });

    useProject.setState({ name: "a" });

    await useProject.getState().readEnv("srv", "a");

    expect(useProject.getState().env).toEqual({
      env: {
        keys: ["DATABASE_URL"],
        path: "/home/dev/projects/a/.env.local",
        template: true,
        written: false,
      },
      status: "read",
    });

    await useProject.getState().readEnv("srv", "a", true);

    expect(forced).toEqual([false, true]);
    expect(useProject.getState().env).toMatchObject({
      env: { written: true },
      status: "read",
    });
  });

  it("garde le refus de l'agent tel quel", async () => {
    stubPupitre({
      projectEnv: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            fix: "Ajoute un .env.example",
            message: "aucun modele",
          },
          ok: false,
        }),
    });

    useProject.setState({ name: "a" });

    await useProject.getState().readEnv("srv", "a");

    expect(useProject.getState().env).toMatchObject({
      error: { fix: "Ajoute un .env.example" },
      status: "failed",
    });
  });
});
