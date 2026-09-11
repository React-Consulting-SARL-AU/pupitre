import { describe, expect, it } from "bun:test";
import { databaseOfDump } from "../dumps";

describe("la base qu'un dump nourrit", () => {
  it("se lit dans un nom daté comme l'agent le lit", () => {
    expect(databaseOfDump("fulldump_shop_20260101.sql")).toBe("shop");
    expect(databaseOfDump("dump_intranet_3.sql.gz")).toBe("intranet");
  });

  it("est ce qui précède le premier point sinon", () => {
    expect(databaseOfDump("intranet.sql")).toBe("intranet");
    expect(databaseOfDump("shop.dump.gz")).toBe("shop");
    expect(databaseOfDump("shop")).toBe("shop");
  });
});
