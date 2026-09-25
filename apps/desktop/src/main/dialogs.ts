/**
 * The labels the system displays itself.
 *
 * A file dialog, the menu bar and a notification are painted by macOS or
 * Windows, never by the renderer: they cannot read the app's dictionary, so
 * the main process keeps these phrases, and nothing else.
 */
const DIALOGS = {
  en: {
    attentionBody: "{title} is waiting for you.",
    attentionTitle: "A session needs you",
    checkUpdates: "Check for Updates…",
    choose: "Choose",
    goToProject: "Go to…",
    helpDocs: "Documentation",
    helpLegal: "Terms and Privacy",
    helpMenu: "Help",
    helpSupport: "Contact Support",
    import: "Import",
    newAgent: "New Agent Session",
    newTerminal: "New Terminal",
    pickFolder: "Choose a folder",
    pickKey: "Choose a private key",
    pickUpload: "Choose what to send to the server",
    preferences: "Preferences…",
    save: "Save",
    saveAs: "Save as",
    send: "Send",
    shortcuts: "Keyboard Shortcuts",
    signOut: "Sign Out…",
    supportSubject: "Pupitre support",
    viewMenu: "View",
  },
  fr: {
    attentionBody: "{title} vous attend.",
    attentionTitle: "Une session a besoin de vous",
    checkUpdates: "Rechercher des mises à jour…",
    choose: "Choisir",
    goToProject: "Aller à…",
    helpDocs: "Documentation",
    helpLegal: "Conditions et confidentialité",
    helpMenu: "Aide",
    helpSupport: "Contacter le support",
    import: "Importer",
    newAgent: "Nouvelle session d'agent",
    newTerminal: "Nouveau terminal",
    pickFolder: "Choisir un dossier",
    pickKey: "Choisir une clé privée",
    pickUpload: "Choisir ce qu'il faut envoyer au serveur",
    preferences: "Préférences…",
    save: "Enregistrer",
    saveAs: "Enregistrer sous",
    send: "Envoyer",
    shortcuts: "Raccourcis clavier",
    signOut: "Se déconnecter…",
    supportSubject: "Support Pupitre",
    viewMenu: "Présentation",
  },
} as const;

type DialogKey = keyof (typeof DIALOGS)["fr"];

/** In the language named, `fr-FR` as the system says it or `fr` as the app does. */
export function dialogTextIn(
  language: string,
  key: DialogKey,
  values: Record<string, string> = {}
): string {
  const text: string = DIALOGS[language.startsWith("fr") ? "fr" : "en"][key];

  return text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
