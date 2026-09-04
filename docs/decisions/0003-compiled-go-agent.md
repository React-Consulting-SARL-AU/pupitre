# 0003 — Un agent Go compilé plutôt que des scripts

Date : 2026-09-04 · Statut : acceptée

La stack serveur est réécrite en un binaire Go statique, `pupitred`. Les scripts bash et zsh de `server/` deviennent la spécification des modules et disparaissent module par module.

Pourquoi : rien de lisible sur le serveur du client, un seul artefact à distribuer et signer, un protocole JSON structuré au lieu d'ANSI à parser, des étapes idempotentes testables sur un staging réinstallé. tmux reste le gestionnaire de sessions : l'agent le pilote, il ne le remplace pas.
