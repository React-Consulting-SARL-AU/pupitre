import { describe, expect, it } from "bun:test";
import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { renderToStaticMarkup } from "react-dom/server";
import { ShotRow } from "../shots/shot-row";

/**
 * A capture, as the gallery lists it: its name, its folder and its weight, all
 * of them read off what the agent answered and none of them computed here.
 */

const SHOT: Shot = {
  created_at: "2026-09-04T10:00:00Z",
  name: "accueil.png",
  path: "/var/lib/pupitre/shots/accueil.png",
  size_bytes: 2_400_000,
};

describe("une capture", () => {
  it("montre son nom, son dossier et son poids", () => {
    const html = renderToStaticMarkup(<ShotRow shot={SHOT} />);

    expect(html).toContain("accueil.png");
    expect(html).toContain("/var/lib/pupitre/shots/accueil.png");
    expect(html).toContain("2,3 Mo");
  });

  it("montre la date brute quand le serveur en donne une illisible", () => {
    const html = renderToStaticMarkup(
      <ShotRow shot={{ ...SHOT, created_at: "hier" }} />
    );

    expect(html).toContain("hier");
  });
});
