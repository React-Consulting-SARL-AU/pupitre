import type { PhaseId, PhaseStatus } from "../../stores/first-project";
import type { StatusShape, StatusTone } from "../ui/status-dot";

export const PHASE_TITLES: Record<PhaseId, string> = {
  add: "Déclaration du projet",
  install: "Installation des dépendances",
  logs: "Adresse et journal",
  sources: "Récupération des sources",
  up: "Démarrage",
};

/** What each phase is doing while it runs, so no wait is ever mute. */
export const PHASE_DOING: Record<PhaseId, string> = {
  add: "L'agent écrit la ligne du projet dans son registre.",
  install: "L'agent installe les dépendances avec le gestionnaire choisi.",
  logs: "L'agent donne l'adresse du projet et ouvre son journal.",
  sources: "L'agent clone le dépôt et installe les dépendances.",
  up: "L'agent lance la commande de démarrage dans sa session.",
};

export type PhaseLook = {
  shape: StatusShape;
  tone: StatusTone;
  label: string;
};

/**
 * Five fates, five outlines. The tone only confirms what the shape already
 * says, so the whole screen survives being read in pure greys.
 */
export const PHASE_LOOK: Record<PhaseStatus, PhaseLook> = {
  fail: { label: "en échec", shape: "struck", tone: "danger" },
  ok: { label: "faite", shape: "filled", tone: "ok" },
  pending: { label: "en attente", shape: "empty", tone: "neutral" },
  running: { label: "en cours", shape: "breathing", tone: "neutral" },
  skip: { label: "sans objet", shape: "empty", tone: "neutral" },
};
