export const activity = {
  en: {
    "activity.title": "Processes and sessions",
    "activity.weighs": "What weighs",
    "activity.sessions.title": "Background sessions",
    "activity.processes.empty": "No notable process",
    "activity.process.question":
      "Stop {command} (process {pid})? The process is asked to close cleanly; what it has not saved is lost.",
    "activity.process.forceQuestion":
      "{command} (process {pid}) ignored the stop: forcing ends it at once, and nothing it held is saved.",
    "activity.force": "Force stop",
    "activity.session.reattach": "Reattach",
    "activity.session.reattachHint": "Reattach {project}",
    "activity.kind.agent": "agent",
    "activity.kind.ide": "remote editor",
    "activity.kind.shell": "shell",
    "activity.sessions.empty": "No background session",
    "activity.session.one": "{count} session",
    "activity.session.other": "{count} sessions",
    "activity.session.tab": "tab open",
    "activity.session.question":
      "Stop the session {command} ({pid})? What runs in it ends, with no way back.",
    "activity.stop": "Stop",
    "activity.clean.question":
      "Sessions idle for a long time are stopped along with what runs in them, with no way back.",
    "activity.clean.action": "Stop idle sessions",
  },
  fr: {
    "activity.title": "Processus et sessions",
    "activity.weighs": "Ce qui pèse",
    "activity.sessions.title": "Sessions en arrière-plan",
    "activity.processes.empty": "Aucun processus notable",
    "activity.process.question":
      "Arrêter {command} (processus {pid}) ? Le processus est prié de se fermer proprement ; ce qu'il n'a pas enregistré est perdu.",
    "activity.process.forceQuestion":
      "{command} (processus {pid}) a ignoré l'arrêt : forcer le termine sur-le-champ, et rien de ce qu'il tenait n'est sauvé.",
    "activity.force": "Forcer l'arrêt",
    "activity.session.reattach": "Rattacher",
    "activity.session.reattachHint": "Rattacher {project}",
    "activity.kind.agent": "agent",
    "activity.kind.ide": "éditeur distant",
    "activity.kind.shell": "shell",
    "activity.sessions.empty": "Aucune session en arrière-plan",
    "activity.session.one": "{count} session",
    "activity.session.other": "{count} sessions",
    "activity.session.tab": "onglet ouvert",
    "activity.session.question":
      "Arrêter la session {command} ({pid}) ? Ce qui y tourne s'arrête, sans retour possible.",
    "activity.stop": "Arrêter",
    "activity.clean.question":
      "Les sessions inactives depuis longtemps sont arrêtées avec ce qui y tourne, sans retour possible.",
    "activity.clean.action": "Arrêter les sessions inactives",
  },
} as const;
