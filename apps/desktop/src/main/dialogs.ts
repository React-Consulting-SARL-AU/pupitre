/**
 * The labels the system displays itself.
 *
 * A file dialog, the menu bar and a notification are painted by macOS or
 * Windows, never by the renderer: they cannot read the app's dictionary, so
 * the main process keeps these phrases, and nothing else. French is typed
 * against English, so a phrase missing from either fails the typecheck.
 */
const EN = {
  attentionBody: "{title} is waiting for you.",
  attentionTitle: "A session needs you",
  checkUpdates: "Check for Updates…",
  choose: "Choose",
  fatalContinue: "Keep Open",
  fatalDetail:
    "What happened is written in {path}. Relaunching reopens the app where it was; the sessions on your servers keep running.",
  fatalQuit: "Quit",
  fatalRelaunch: "Relaunch",
  fatalTitle: "Pupitre ran into an error",
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
  preferences: "Settings…",
  save: "Save",
  saveAs: "Save as",
  send: "Send",
  shortcuts: "Keyboard Shortcuts",
  signOut: "Sign Out…",
  supportSubject: "Pupitre support",
  viewMenu: "View",
} as const;

type DialogKey = keyof typeof EN;

const FR: Record<DialogKey, string> = {
  attentionBody: "{title} vous attend.",
  attentionTitle: "Une session a besoin de vous",
  checkUpdates: "Rechercher des mises à jour…",
  choose: "Choisir",
  fatalContinue: "Laisser ouvert",
  fatalDetail:
    "Ce qui s'est passé est écrit dans {path}. Relancer rouvre l'app là où elle était ; les sessions sur vos serveurs continuent de tourner.",
  fatalQuit: "Quitter",
  fatalRelaunch: "Relancer",
  fatalTitle: "Pupitre a rencontré une erreur",
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
  preferences: "Réglages…",
  save: "Enregistrer",
  saveAs: "Enregistrer sous",
  send: "Envoyer",
  shortcuts: "Raccourcis clavier",
  signOut: "Se déconnecter…",
  supportSubject: "Support Pupitre",
  viewMenu: "Présentation",
};

const PLACEHOLDER = /\{(\w+)\}/g;

/** In the language named, `fr-FR` as the system says it or `fr` as the app does. */
export function dialogTextIn(
  language: string,
  key: DialogKey,
  values: Record<string, string> = {}
): string {
  const text = (language.startsWith("fr") ? FR : EN)[key];

  return text.replace(PLACEHOLDER, (_, name: string) => values[name] ?? "");
}
