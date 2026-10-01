export interface LlmsLink {
  title: string
  path: string
  note: string
}

export interface LlmsContent {
  title: string
  summary: string
  note: string
  sections: {
    start: string
    documentation: string
    catalog: string
    product: string
    writing: string
    legal: string
    languages: string
  }
  product: LlmsLink[]
  alternate: { title: string; note: string }
}

/** `llms.txt` is served once, from the root, in English only: it has no French twin. */
export const LLMS: LlmsContent = {
  title: "Pupitre",
  summary:
    "A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server. The customer brings the machine; Pupitre inspects it, installs the services they choose, hardens it, and becomes the window onto it.",
  note: "Pupitre is source-available under the Apache 2.0 licence with the Commons Clause: free to use, modify and self-host, never to be sold. The hosted platform is free up to {count} servers per organisation; beyond that, a licence is granted on request. Neither the platform nor support ever connects to a customer's server, no private key leaves their laptop, and when Pupitre is removed the server keeps running as an ordinary Ubuntu machine.",
  sections: {
    start: "Start here",
    documentation: "Documentation",
    catalog: "Service catalogue",
    product: "Product",
    writing: "Writing",
    legal: "Legal",
    languages: "Other languages",
  },
  product: [
    {
      title: "Pricing",
      path: "/pricing/",
      note: "Free up to {count} servers per organisation, a licence on request beyond, what the source licence allows, and what stays when Pupitre is removed.",
    },
    {
      title: "Download",
      path: "/download/",
      note: "The desktop app for macOS, Windows and Linux, with the requirements on both sides.",
    },
    {
      title: "Integrations",
      path: "/integrations/",
      note: "Every service Pupitre installs and manages on the server, by category, each one linked to its documentation.",
    },
    {
      title: "Security",
      path: "/security/",
      note: "What the agent can and cannot do on the server, what the platform knows, the command that checks each claim, and how to remove Pupitre.",
    },
  ],
  alternate: {
    title: "Français",
    note: "The whole site exists in {locales} under the same paths.",
  },
}
