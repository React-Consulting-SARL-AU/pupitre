import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "../ui/page-header";
import { Screen } from "../ui/screen";
import { Tab, TabBar } from "../ui/tab-bar";

const NOOP = () => undefined;

describe("a page frame", () => {
  it("puts the header on its own band, and scrolls the body under it", () => {
    const html = renderToStaticMarkup(
      <Screen eyebrow="Serveur" title="Fichiers">
        <p>corps</p>
      </Screen>
    );

    expect(html).toContain('data-screen="scroll"');
    expect(html).toContain("bg-surface pt-5 border-b pb-6");
    expect(html).toContain("overflow-y-auto bg-base");
    expect(html).not.toContain("max-w-");
    expect(html).not.toContain("mx-auto");
    expect(html).toMatch(/<h1[^>]*>Fichiers<\/h1>/);
    expect(html.indexOf("overflow-y-auto")).toBeGreaterThan(
      html.indexOf("</header>")
    );
  });

  it("holds a step on its column, and puts its bar under it", () => {
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

  // The onboarding rail already says where the reader is, so its steps carry no band.
  it("reads an onboarding step header on the page, without a band", () => {
    const html = renderToStaticMarkup(
      <Screen column plain step="inspection" title="atelier">
        <p>corps</p>
      </Screen>
    );

    expect(html).not.toContain("bg-surface");
    expect(html).not.toContain("border-b");
    expect(html).toContain("pt-10");
  });

  it("keeps the header above a body that holds its own height", () => {
    const html = renderToStaticMarkup(
      <Screen fill title="Terminaux">
        <p>corps</p>
      </Screen>
    );

    expect(html).toContain('data-screen="fill"');
    expect(html).toContain("bg-surface pt-5 border-b pb-6");
    expect(html).toContain(
      '<div class="min-h-0 flex-1 bg-base"><p>corps</p></div>'
    );
  });

  it("puts the tabs under the title, in place of the border", () => {
    const html = renderToStaticMarkup(
      <Screen
        fill
        tabs={
          <TabBar label="Les pages" onChange={NOOP} value="overview">
            <Tab value="overview">Vue</Tab>
            <Tab value="logs">Journal</Tab>
          </TabBar>
        }
        title="atlas-web"
      >
        <p>corps</p>
      </Screen>
    );

    expect(html).not.toContain("border-b pb-6");
    expect(html).toContain('role="tablist"');
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(html.indexOf("Vue")).toBeGreaterThan(html.indexOf("atlas-web"));
    expect(html.indexOf("corps")).toBeGreaterThan(html.indexOf("Journal"));
  });
});

describe("a page header", () => {
  it("puts what accompanies the title on its line, outside the h1", () => {
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
