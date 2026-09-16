import { beforeEach, describe, expect, it } from "bun:test";
import type { SshShareState } from "@shared/ssh-names";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useSshShare } from "../ssh-share";

const UNSHARED: SshShareState = {
  line: "Include /data/ssh/config",
  servers: [{ id: "srv-a", name: "Atelier", ssh: "atelier" }],
  shared: false,
  userConfigPath: "/home/jean/.ssh/config",
};

beforeEach(() => {
  useSshShare.setState({ state: null });
});

describe("le partage du fichier SSH du système", () => {
  it("ne dessine rien avant d'avoir lu, puis ce qui a été lu", async () => {
    stubPupitre({ sshShareState: () => Promise.resolve(UNSHARED) });

    expect(useSshShare.getState().state).toBeNull();

    await useSshShare.getState().read();

    expect(useSshShare.getState().state).toEqual(UNSHARED);
  });

  it("montre ce que le fichier dit après l'écriture, pas ce qui a été demandé", async () => {
    const asked: boolean[] = [];

    stubPupitre({
      setSshShare: (shared) => {
        asked.push(shared);

        return Promise.resolve({ ...UNSHARED, shared: false });
      },
    });

    await useSshShare.getState().set(true);

    expect(asked).toEqual([true]);
    expect(useSshShare.getState().state?.shared).toBe(false);
  });
});
