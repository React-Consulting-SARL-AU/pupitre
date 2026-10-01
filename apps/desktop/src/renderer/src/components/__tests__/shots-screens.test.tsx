import { describe, expect, it } from "bun:test";
import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { renderToStaticMarkup } from "react-dom/server";
import { ShotTile } from "../shots/shot-tile";

const SHOT: Shot = {
  created_at: "2026-09-04T10:00:00Z",
  name: "accueil.png",
  path: "2026-09-04/accueil.png",
  size_bytes: 2_400_000,
};

const NOOP = () => undefined;

const REMOVE = () => Promise.resolve();

describe("a gallery thumbnail", () => {
  it("shows the name, the size and the deletion, and waits for its bytes", () => {
    const html = renderToStaticMarkup(
      <ShotTile
        folder={null}
        onRemove={REMOVE}
        onShow={NOOP}
        onVisible={NOOP}
        removing={false}
        shot={SHOT}
        shown={false}
        thumbnail={undefined}
      />
    );

    expect(html).toContain("accueil.png");
    expect(html).toContain("2,3 Mo");
    expect(html).toContain("Supprimer");
    expect(html).toContain('data-shot="2026-09-04/accueil.png"');
    expect(html).toContain("animate-breathe");
    expect(html).not.toContain("<img");
  });

  it("draws the image once the bytes are received", () => {
    const html = renderToStaticMarkup(
      <ShotTile
        folder={null}
        onRemove={REMOVE}
        onShow={NOOP}
        onVisible={NOOP}
        removing={false}
        shot={SHOT}
        shown={true}
        thumbnail={{
          blob: new Blob(),
          mediaType: "image/png",
          status: "ready",
          url: "blob:accueil",
        }}
      />
    );

    expect(html).toContain('src="blob:accueil"');
    expect(html).toContain('alt="Capture accueil.png"');
    expect(html).toContain('data-shown="true"');
  });

  it("shows the raw date when the server gives an unreadable one", () => {
    const html = renderToStaticMarkup(
      <ShotTile
        folder={null}
        onRemove={REMOVE}
        onShow={NOOP}
        onVisible={NOOP}
        removing={false}
        shot={{ ...SHOT, created_at: "hier" }}
        shown={false}
        thumbnail={undefined}
      />
    );

    expect(html).toContain("hier");
  });

  it("names its folder when the gallery shows all projects", () => {
    const html = renderToStaticMarkup(
      <ShotTile
        folder="boutique"
        onRemove={REMOVE}
        onShow={NOOP}
        onVisible={NOOP}
        removing={false}
        shot={SHOT}
        shown={false}
        thumbnail={undefined}
      />
    );

    expect(html).toContain("boutique · 2,3 Mo");
  });
});
