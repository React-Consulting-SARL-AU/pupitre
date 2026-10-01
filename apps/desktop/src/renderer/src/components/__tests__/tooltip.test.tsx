import { describe, expect, it } from "bun:test";
import { Search } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { Tooltip } from "../ui/tooltip";

describe("a tooltip", () => {
  it("attaches to the control it is given, without changing its nature", () => {
    const html = renderToStaticMarkup(
      <Tooltip label="Chercher">
        <button className="clickable" type="button">
          <Search size={12} />
        </button>
      </Tooltip>
    );

    expect(html).toMatch(/^<button[^>]*class="clickable"[^>]*type="button"/);
    expect(html).toContain('data-tooltip="Chercher"');
    expect(html).not.toContain("title=");
  });

  it("stays closed while nobody hovers", () => {
    const html = renderToStaticMarkup(
      <Tooltip label="Chercher">
        <button type="button">go</button>
      </Tooltip>
    );

    expect(html).not.toContain("Chercher</");
  });
});

describe("an icon button", () => {
  it("carries its name for the screen reader and for the mouse", () => {
    const html = renderToStaticMarkup(
      <IconButton icon={Search} label="Chercher" />
    );

    expect(html).toContain('aria-label="Chercher"');
    expect(html).toContain('data-tooltip="Chercher"');
    expect(html).not.toContain("title=");
  });
});

describe("a button", () => {
  it("has a bubble only if it has something to add", () => {
    const bare = renderToStaticMarkup(<Button>Envoyer</Button>);
    const hinted = renderToStaticMarkup(
      <Button hint="Vers le serveur">Envoyer</Button>
    );

    expect(bare).not.toContain("data-tooltip");
    expect(hinted).toContain('data-tooltip="Vers le serveur"');
  });
});
