import { describe, expect, it } from "bun:test";
import { databaseOfDump } from "../dumps";

describe("the database a dump feeds", () => {
  it("is read from a dated name the way the agent reads it", () => {
    expect(databaseOfDump("fulldump_shop_20260101.sql")).toBe("shop");
    expect(databaseOfDump("dump_intranet_3.sql.gz")).toBe("intranet");
  });

  it("is whatever precedes the first dot otherwise", () => {
    expect(databaseOfDump("intranet.sql")).toBe("intranet");
    expect(databaseOfDump("shop.dump.gz")).toBe("shop");
    expect(databaseOfDump("shop")).toBe("shop");
  });
});
