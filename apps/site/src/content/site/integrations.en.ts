import type { IntegrationsContent } from "./integrations"

export const integrationsEn: IntegrationsContent = {
  meta: {
    title: "Integrations — Pupitre",
    description:
      "Every service Pupitre installs and manages on your server: runtimes, databases, AI agents, remote editors, exposure and tools, each one linked to its documentation.",
  },
  hero: {
    label: "Integrations",
    headline: "Every service the app manages for you.",
    lead: "The same catalogue as in the app, in the same order. Each service installs itself, checks itself, updates itself and reports its state on your server. Its page says what it installs and what it asks you for.",
    cta: "Download the app",
  },
  entry: {
    documentation: "Documentation",
  },
  closing: {
    title: "Something missing?",
    body: "The server stays an ordinary Ubuntu machine and you are its administrator: anything outside this catalogue installs the usual way, and Pupitre leaves it alone.",
    link: "How Pupitre treats what it did not install",
  },
}
