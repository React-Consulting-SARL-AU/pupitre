import { useLocale } from "@renderer/stores/locale";

/** The main process writes the mail, with the app and system versions the first answer would ask for. */
export function useContactSupport(): () => Promise<void> {
  const language = useLocale((store) => store.resolved);

  return () => window.pupitre.openHelp("support", language);
}
