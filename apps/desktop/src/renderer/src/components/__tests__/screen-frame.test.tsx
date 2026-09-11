import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "../ui/page-header";
import { Screen } from "../ui/screen";
import { TabBar, TabButton } from "../ui/tab-bar";

/**
 * The frame every page of the shell shares: a header on its own band, one
 * title, the controls at one place, and the whole width whatever the page
 * says.
 */

const NOOP = () => undefined;

describe("le cadre d'une page", () => {
  it("pose l'en-tête sur un bandeau à part, et fait défiler le corps sous lui", () => {
    const html = renderToStaticMarkup(
      <Screen eyebrow="Serveur" title="Fichiers">
        <p>corps</p>
      </Screen>
    );

    expect(html).toContain('data-screen="scroll"');
    expect(html).toContain("bg-surface pt-4 border-b pb-5");
    expect(html).toContain("overflow-y-auto bg-base");
    expect(html).not.toContain("max-w-");
    expect(html).not.toContain("mx-auto");
    expect(html).toMatch(/<h1[^>]*>Fichiers<\/h1>/);
    expect(html.indexOf("overflow-y-auto")).toBeGreaterThan(
      html.indexOf("</header>")
    );
  });

  /** A step of a sequence keeps its column, in the band as under it, and ends on its bar. */
  it("tient une étape sur sa colonne, et pose sa barre sous elle", () => {
    const html = renderToStaticMarkup(
      <Screen
        column
        footer={<div data-actions="catalog">barre</div>}
        step="catalog"
        title="atelier"
      >
        <p>corps</p>
      </Screen>
    );

    expect(html.match(/max-w-3xl/g)?.length).toBe(2);
    expect(html).toContain('data-step-heading="catalog"');
    expect(html).toContain('tabindex="-1"');
    expect(html.indexOf('data-actions="catalog"')).toBeGreaterThan(
      html.indexOf("corps")
    );
    expect(html.indexOf('data-actions="catalog"')).toBeGreaterThan(
      html.indexOf("overflow-y-auto")
    );
  });

  /** The onboarding's rail already says where the reader is: its steps carry no band. */
  it("lit l'en-tête d'une étape de l'onboarding sur la page, sans bandeau", () => {
    const html = renderToStaticMarkup(
      <Screen column plain step="inspection" title="atelier">
        <p>corps</p>
      </Screen>
    );

    expect(html).not.toContain("bg-surface");
    expect(html).not.toContain("border-b");
    expect(html).toContain("pt-10");
  });

  it("garde l'en-tête au-dessus d'un corps qui tient sa propre hauteur", () => {
    const html = renderToStaticMarkup(
      <Screen fill title="Terminaux">
        <p>corps</p>
      </Screen>
    );

    expect(html).toContain('data-screen="fill"');
    expect(html).toContain("bg-surface pt-4 border-b pb-5");
    expect(html).toContain(
      '<div class="min-h-0 flex-1 bg-base"><p>corps</p></div>'
    );
  });

  it("pose les onglets sous le titre, à la place de la bordure", () => {
    const html = renderToStaticMarkup(
      <Screen
        fill
        tabs={
          <TabBar>
            <TabButton active onClick={NOOP}>
              Vue
            </TabButton>
            <TabButton active={false} onClick={NOOP}>
              Journal
            </TabButton>
          </TabBar>
        }
        title="atlas-web"
      >
        <p>corps</p>
      </Screen>
    );

    expect(html).not.toContain("border-b pb-5");
    expect(html).toContain('data-active="true"');
    expect(html.match(/data-active/g)?.length).toBe(1);
    expect(html.indexOf("Vue")).toBeGreaterThan(html.indexOf("atlas-web"));
    expect(html.indexOf("corps")).toBeGreaterThan(html.indexOf("Journal"));
  });
});

describe("l'en-tête d'une page", () => {
  it("met ce qui accompagne le titre sur sa ligne, hors du h1", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        actions={<button type="button">Relire</button>}
        description="Ce que le module dit de lui."
        leading={<span data-logo="" />}
        meta={<span data-state="running" />}
        title="PostgreSQL 17"
      />
    );

    expect(html).toMatch(/<h1[^>]*>PostgreSQL 17<\/h1>/);
    expect(html).not.toMatch(/<h1[^>]*>[^<]*data-state/);
    expect(html.indexOf("data-logo")).toBeLessThan(html.indexOf("<h1"));
    expect(html.indexOf("data-state")).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html.indexOf("Relire")).toBeGreaterThan(
      html.indexOf("Ce que le module dit de lui.")
    );
  });
});
