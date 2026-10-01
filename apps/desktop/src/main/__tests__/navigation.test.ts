import { describe, expect, it } from "bun:test";
import { openable, ownPage } from "../navigation";

const INDEX =
  "/Applications/Pupitre.app/Contents/Resources/renderer/index.html";

describe("what the browser may open", () => {
  it("lets through an https address, packaged or not", () => {
    expect(openable("https://app.pupitre.studio/dashboard", true)).toBe(true);
    expect(openable("https://github.com/login/device", false)).toBe(true);
  });

  it("only opens the local console in plain text in development", () => {
    expect(openable("http://localhost:3000/auth/device", false)).toBe(true);
    expect(openable("http://localhost:3000/auth/device", true)).toBe(false);
  });

  it("refuses any other scheme, and http elsewhere", () => {
    expect(openable("http://example.com", false)).toBe(false);
    expect(openable("file:///etc/passwd", false)).toBe(false);
    expect(openable("javascript:alert(1)", true)).toBe(false);
    expect(openable("smb://nas/share", true)).toBe(false);
  });
});

describe("where the window may navigate", () => {
  it("recognises the packaged page, anchor included", () => {
    const rules = { devUrl: undefined, indexFile: INDEX };

    expect(ownPage(`file://${INDEX}`, rules)).toBe(true);
    expect(ownPage(`file://${INDEX}#/projects`, rules)).toBe(true);
  });

  it("recognises the dev server when it serves the page", () => {
    const rules = { devUrl: "http://localhost:5173", indexFile: INDEX };

    expect(ownPage("http://localhost:5173/", rules)).toBe(true);
    expect(ownPage("http://localhost:5173/#/settings", rules)).toBe(true);
    expect(ownPage("http://localhost:5174/", rules)).toBe(false);
  });

  it("refuses anything that is not the app page", () => {
    const rules = { devUrl: "http://localhost:5173", indexFile: INDEX };

    expect(ownPage("https://app.pupitre.studio/", rules)).toBe(false);
    expect(ownPage("file:///etc/hosts", rules)).toBe(false);
    expect(ownPage("file:///Applications/Pupitre.app/other.html", rules)).toBe(
      false
    );
    expect(ownPage("javascript:void(0)", rules)).toBe(false);
    expect(ownPage("not a url", rules)).toBe(false);
  });
});
