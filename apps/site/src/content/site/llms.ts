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
  note: "Pupitre is a closed commercial product. Nothing connects inward to a customer's server, no private key leaves their laptop, and when a subscription stops the server keeps running as an ordinary Ubuntu machine.",
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
      note: "One price per server, monthly or yearly, and what happens when it stops.",
    },
    {
      title: "Download",
      path: "/download/",
      note: "The desktop app for macOS, Windows and Linux, with the requirements on both sides.",
    },
    {
      title: "Changelog",
      path: "/changelog/",
      note: "One entry per release of the app and of the agent.",
    },
  ],
  alternate: {
    title: "Français",
    note: "The whole site exists in {locales} under the same paths.",
  },
}
