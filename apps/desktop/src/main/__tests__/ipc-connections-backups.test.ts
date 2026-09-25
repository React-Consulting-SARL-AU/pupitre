import { describe, expect, it } from "bun:test";
import { OTHER_PAGE, OWN_PAGE, recordChannels, refused } from "./ipc-recorder";

recordChannels();

const { registerConnections } = await import("../connections");
const { registerBackups } = await import("../backups");
const { registerTransfers } = await import("../transfers");
const { registerFleet } = await import("../fleet");

registerConnections();
registerBackups();
registerTransfers({ root: () => Promise.resolve(null) });
registerFleet(() => undefined);

describe("les canaux des comptes tiers et du tunnel", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("connections:connect", OTHER_PAGE, "github", "t")).toBe(
      true
    );
    expect(refused("tunnel:release", OTHER_PAGE, "s1", [])).toBe(true);
  });

  it("refusent un compte choisi qui n'est pas un texte", () => {
    expect(refused("connections:connect", OWN_PAGE, "github", "t", 42)).toBe(
      true
    );
  });

  it("refusent un argument de trop", () => {
    expect(refused("connections:state", OWN_PAGE, "extra")).toBe(true);
    expect(
      refused("connections:connect", OWN_PAGE, "github", "t", "a", "extra")
    ).toBe(true);
    expect(refused("connections:forget", OWN_PAGE, "github", "extra")).toBe(
      true
    );
    expect(refused("connections:verify", OWN_PAGE, "github", "extra")).toBe(
      true
    );
    expect(refused("connections:zones", OWN_PAGE, "extra")).toBe(true);
    expect(refused("tunnel:release", OWN_PAGE, "s1", [], "extra")).toBe(true);
    expect(refused("tunnel:records", OWN_PAGE, "s1", [], "extra")).toBe(true);
  });
});

describe("les canaux des sauvegardes", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("backup:list", OTHER_PAGE, null)).toBe(true);
    expect(refused("backup:restore-abort", OTHER_PAGE, "s1")).toBe(true);
  });

  it("refusent une restauration sans jeton de suivi", () => {
    expect(
      refused("backup:restore-setup", OWN_PAGE, 3, "s1", "b1", "p", {})
    ).toBe(true);
    expect(
      refused("backup:restore-data", OWN_PAGE, 3, "s1", "b1", [], null)
    ).toBe(true);
  });

  it("refusent une phrase secrète qui n'est ni un texte ni nulle", () => {
    expect(
      refused("backup:restore-data", OWN_PAGE, "t", "s1", "b1", [], 42)
    ).toBe(true);
  });

  it("refusent un argument de trop", () => {
    expect(refused("backup:connection", OWN_PAGE, "extra")).toBe(true);
    expect(refused("backup:identity", OWN_PAGE, "extra")).toBe(true);
    expect(refused("backup:probe", OWN_PAGE, {}, "extra")).toBe(true);
    expect(refused("backup:connect", OWN_PAGE, {}, "extra")).toBe(true);
    expect(refused("backup:list", OWN_PAGE, null, "extra")).toBe(true);
    expect(
      refused("backup:restore-setup", OWN_PAGE, "t", "s1", "b1", "p", {}, 1)
    ).toBe(true);
    expect(
      refused("backup:restore-data", OWN_PAGE, "t", "s1", "b1", [], null, 1)
    ).toBe(true);
    expect(refused("backup:restore-abort", OWN_PAGE, "s1", "extra")).toBe(true);
  });
});

describe("les canaux des transferts", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("transfer:pause", OTHER_PAGE, "id")).toBe(true);
    expect(refused("transfer:pick-save", OTHER_PAGE, "a.txt")).toBe(true);
  });

  it("refusent un identifiant de transfert qui n'est pas un texte", () => {
    expect(refused("transfer:pause", OWN_PAGE, 1)).toBe(true);
    expect(refused("transfer:resume", OWN_PAGE, 1)).toBe(true);
    expect(refused("transfer:cancel", OWN_PAGE, 1)).toBe(true);
    expect(refused("transfer:dismiss", OWN_PAGE, 1)).toBe(true);
  });

  it("refusent un chemin déposé ou un nom de fichier qui n'est pas un texte", () => {
    expect(refused("transfer:dropped", OWN_PAGE, null)).toBe(true);
    expect(refused("transfer:pick-save", OWN_PAGE, 7)).toBe(true);
  });

  it("refusent un argument de trop", () => {
    expect(refused("transfer:list", OWN_PAGE, "extra")).toBe(true);
    expect(refused("transfer:upload", OWN_PAGE, "s1", "/", [], "extra")).toBe(
      true
    );
    expect(
      refused("transfer:download", OWN_PAGE, "s1", "a", "/tmp/a", "extra")
    ).toBe(true);
    expect(refused("transfer:pause", OWN_PAGE, "id", "extra")).toBe(true);
    expect(refused("transfer:dropped", OWN_PAGE, "/tmp/a", "extra")).toBe(true);
    expect(refused("transfer:pick-upload", OWN_PAGE, "extra")).toBe(true);
    expect(refused("transfer:pick-save", OWN_PAGE, "a.txt", "extra")).toBe(
      true
    );
    expect(refused("transfer:pick-folder", OWN_PAGE, "extra")).toBe(true);
  });
});

describe("les canaux de la flotte", () => {
  it("refusent un autre cadre que la page de l'app", () => {
    expect(refused("fleet:open", OTHER_PAGE, "id")).toBe(true);
  });

  it("refusent un argument de trop", () => {
    expect(refused("fleet:list", OWN_PAGE, "extra")).toBe(true);
    expect(refused("fleet:open", OWN_PAGE, "id", "extra")).toBe(true);
    expect(refused("fleet:restore", OWN_PAGE, "extra")).toBe(true);
  });
});
