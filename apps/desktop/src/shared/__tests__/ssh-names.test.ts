import { describe, expect, it } from "bun:test";
import { editorsFor, REMOTE_EDITORS, remoteEditorUrl } from "../editors";
import type { Server } from "../servers";
import { alias, sshNameFree, sshNames, sshSlug } from "../ssh-names";

const ATELIER: Server = {
  host: "203.0.113.10",
  id: "srv-mfx2k1",
  keyPath: "/data/keys/srv-mfx2k1",
  name: "Atelier",
  origin: "app",
  port: 2222,
  slug: "atelier",
  user: "dev",
};

const SYSTEM: Server = {
  host: "dev-vps",
  id: "srv-b",
  name: "Poste de travail",
  origin: "system",
  port: 22,
  user: "",
};

describe("the word typed for an SSH name", () => {
  it("becomes what ssh accepts on a Host line: lowercase, no accent or space", () => {
    expect(sshSlug("Atelier")).toBe("atelier");
    expect(sshSlug("Serveur d'Été 2")).toBe("serveur-d-ete-2");
    expect(sshSlug("  --VPS--  ")).toBe("vps");
  });

  it("does not exist when nothing of it fits on the line, nor when it mimics an alias", () => {
    expect(sshSlug("···")).toBeNull();
    expect(sshSlug("pupitre-srv-x")).toBeNull();
  });
});

describe("a free SSH name", () => {
  it("is neither a system host, nor an alias, nor another server's name", () => {
    expect(sshNameFree("prod", [ATELIER, SYSTEM], [])).toBe(true);
    expect(sshNameFree("atelier", [ATELIER, SYSTEM], [])).toBe(false);
    expect(sshNameFree("dev-vps", [ATELIER, SYSTEM], [])).toBe(false);
    expect(sshNameFree("pupitre-srv-mfx2k1", [ATELIER], [])).toBe(false);
    expect(sshNameFree("bastion", [ATELIER], ["bastion"])).toBe(false);
  });

  it("stays free for the server that already carries it", () => {
    expect(sshNameFree("atelier", [ATELIER, SYSTEM], [], ATELIER.id)).toBe(
      true
    );
  });
});

describe("the names the servers share", () => {
  it("give each app server its SSH name, and a system host its own", () => {
    const names = sshNames([ATELIER, SYSTEM], []);

    expect(names.get(ATELIER.id)).toBe("atelier");
    expect(names.get(SYSTEM.id)).toBe("dev-vps");
  });

  it("leave the alias alone for a server without an SSH name", () => {
    const bare = { ...ATELIER, slug: undefined };

    expect(sshNames([bare], []).get(bare.id)).toBe(alias(bare));
  });

  it("leave the alias alone for a server whose name is already taken", () => {
    const twin = { ...ATELIER, id: "srv-2" };

    const names = sshNames([ATELIER, twin], []);

    expect(names.get(ATELIER.id)).toBe("atelier");
    expect(names.get(twin.id)).toBe(alias(twin));
  });

  it("never take a host the system file declares", () => {
    const names = sshNames([ATELIER], ["atelier"]);

    expect(names.get(ATELIER.id)).toBe("pupitre-srv-mfx2k1");
  });

  it("do not take the alias of a designated system host either", () => {
    const named = { ...ATELIER, slug: "dev-vps" };

    const names = sshNames([SYSTEM, named], []);

    expect(names.get(named.id)).toBe(alias(named));
  });
});

const BACKEND = "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest";

describe("an editor's link", () => {
  const byId = Object.fromEntries(REMOTE_EDITORS.map((e) => [e.id, e]));

  it("names the server by the word the system file resolves, and nothing else", () => {
    expect(remoteEditorUrl(byId.zed, ATELIER, "atelier", "/home/dev/api")).toBe(
      "zed://ssh/atelier/home/dev/api"
    );
    expect(
      remoteEditorUrl(byId.vscode, ATELIER, "atelier", "/home/dev/api")
    ).toBe("vscode://vscode-remote/ssh-remote+atelier/home/dev/api");
    expect(
      remoteEditorUrl(byId.cursor, ATELIER, "atelier", "/home/dev/api")
    ).toBe("cursor://vscode-remote/ssh-remote+atelier/home/dev/api");
  });

  it("gives Gateway the port and account the block states, and the backend the agent set up", () => {
    expect(
      remoteEditorUrl(
        byId.jetbrains,
        ATELIER,
        "atelier",
        "/home/dev/api",
        BACKEND
      )
    ).toBe(
      `jetbrains-gateway://connect#type=ssh&host=atelier&port=2222&user=dev&projectPath=%2Fhome%2Fdev%2Fapi&idePath=${encodeURIComponent(BACKEND)}&deploy=false`
    );
  });

  it("leaves a system host to its alias, without an account", () => {
    expect(
      remoteEditorUrl(
        byId.jetbrains,
        SYSTEM,
        "dev-vps",
        "/home/dev/api",
        BACKEND
      )
    ).toBe(
      `jetbrains-gateway://connect#type=ssh&host=dev-vps&port=22&user=&projectPath=%2Fhome%2Fdev%2Fapi&idePath=${encodeURIComponent(BACKEND)}&deploy=false`
    );
  });

  it("gives no Gateway link until the agent has said where the backend is", () => {
    expect(
      remoteEditorUrl(byId.jetbrains, ATELIER, "atelier", "/home/dev/api")
    ).toBeNull();
    expect(
      remoteEditorUrl(byId.zed, ATELIER, "atelier", "/home/dev/api", null)
    ).toBe("zed://ssh/atelier/home/dev/api");
  });

  it("offers Gateway only with its backend, the others as soon as their module is there", () => {
    const laid = editorsFor([
      { id: "editor.jetbrains" },
      { id: "editor.zed" },
      { id: "editor.vscode", path: "/nowhere" },
    ]);

    expect(laid.map((editor) => editor.id)).toEqual([
      "vscode",
      "cursor",
      "zed",
    ]);
    expect(
      editorsFor([{ id: "editor.jetbrains", path: BACKEND }]).map((e) => e.id)
    ).toEqual(["jetbrains"]);
  });

  it("refuses a path that is not absolute", () => {
    expect(remoteEditorUrl(byId.zed, ATELIER, "atelier", "../etc")).toBeNull();
  });
});
