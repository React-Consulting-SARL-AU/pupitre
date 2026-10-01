import { afterEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useSudoPassword } from "../sudo-password";

afterEach(() => {
  useSudoPassword.getState().forget();
});

describe("a server's sudo password", () => {
  it("reads what the computer holds of it, server by server", async () => {
    stubPupitre({
      sudoPasswordState: (serverId: string) =>
        Promise.resolve(
          serverId === "srv-1"
            ? { held: true, kept: true }
            : { held: false, kept: false }
        ),
    });

    await useSudoPassword.getState().read("srv-1");
    await useSudoPassword.getState().read("srv-2");

    expect(useSudoPassword.getState().states).toEqual({
      "srv-1": { held: true, kept: true },
      "srv-2": { held: false, kept: false },
    });
  });

  it("rereads what the computer holds once the password is entered and accepted", async () => {
    let held = false;

    stubPupitre({
      enterSudoPassword: () => {
        held = true;

        return Promise.resolve({ kept: true, ok: true });
      },
      sudoPasswordState: () => Promise.resolve({ held, kept: held }),
    });

    await useSudoPassword.getState().read("srv-1");
    const outcome = await useSudoPassword
      .getState()
      .enter("srv-1", "k7mp-q2xw-9hdt-3vzc-u8fa-6rne");

    expect(outcome).toEqual({ kept: true, ok: true });
    expect(useSudoPassword.getState().states["srv-1"]).toEqual({
      held: true,
      kept: true,
    });
    expect(JSON.stringify(useSudoPassword.getState())).not.toContain("k7mp");
  });

  it("never keeps the password: it goes through the requested reveal, and the copy happens on the other side", async () => {
    const copied: string[] = [];

    stubPupitre({
      copySudoPassword: (serverId: string) => {
        copied.push(serverId);

        return Promise.resolve(true);
      },
      revealSudoPassword: () =>
        Promise.resolve("k7mp-q2xw-9hdt-3vzc-u8fa-6rne"),
      sudoPasswordState: () => Promise.resolve({ held: true, kept: false }),
    });

    await useSudoPassword.getState().read("srv-1");

    expect(await useSudoPassword.getState().reveal("srv-1")).toBe(
      "k7mp-q2xw-9hdt-3vzc-u8fa-6rne"
    );
    expect(await useSudoPassword.getState().copy("srv-1")).toBe(true);
    expect(copied).toEqual(["srv-1"]);
    expect(JSON.stringify(useSudoPassword.getState())).not.toContain("k7mp");
  });
});
