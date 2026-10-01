import { beforeEach, describe, expect, it } from "bun:test";
import type { SshShareState } from "@shared/ssh-names";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useSshShare } from "../ssh-share";

const UNSHARED: SshShareState = {
  line: "Include /data/ssh/config",
  servers: [
    {
      host: "203.0.113.10",
      id: "srv-a",
      identityFile: "/home/jean/.pupitre/desktop/keys/srv-a",
      name: "Atelier",
      port: 22,
      ssh: "atelier",
      user: "dev",
    },
  ],
  shared: false,
  userConfigPath: "/home/jean/.ssh/config",
};

beforeEach(() => {
  useSshShare.setState({ state: null });
});

describe("sharing the system SSH file", () => {
  it("draws nothing before reading, then what was read", async () => {
    stubPupitre({ sshShareState: () => Promise.resolve(UNSHARED) });

    expect(useSshShare.getState().state).toBeNull();

    await useSshShare.getState().read();

    expect(useSshShare.getState().state).toEqual(UNSHARED);
  });

  it("shows what the file says after writing, not what was requested", async () => {
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
