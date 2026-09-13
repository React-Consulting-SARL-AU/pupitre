import { describe, expect, it } from "bun:test";
import { Search } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { Tooltip } from "../ui/tooltip";

describe("une infobulle", () => {
  it("se pose sur le contrôle qu'on lui donne, sans en changer la nature", () => {
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

  it("reste fermée tant que personne ne survole", () => {
    const html = renderToStaticMarkup(
      <Tooltip label="Chercher">
        <button type="button">go</button>
      </Tooltip>
    );

    expect(html).not.toContain("Chercher</");
  });
});

describe("un bouton à icône", () => {
  it("porte son nom pour le lecteur d'écran et pour la souris", () => {
    const html = renderToStaticMarkup(
      <IconButton icon={Search} label="Chercher" />
    );

    expect(html).toContain('aria-label="Chercher"');
    expect(html).toContain('data-tooltip="Chercher"');
    expect(html).not.toContain("title=");
  });
});

describe("un bouton", () => {
  it("n'a de bulle que s'il a quelque chose à ajouter", () => {
    const bare = renderToStaticMarkup(<Button>Envoyer</Button>);
    const hinted = renderToStaticMarkup(
      <Button hint="Vers le serveur">Envoyer</Button>
    );

    expect(bare).not.toContain("data-tooltip");
    expect(hinted).toContain('data-tooltip="Vers le serveur"');
  });
});
