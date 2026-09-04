# 0009 — Droit d'usage lié au serveur, tolérance de sept jours

Date : 2026-09-04 · Statut : acceptée

L'agent ne fonctionne qu'avec un jeton de serveur obtenu par échange d'un jeton d'enrôlement émis par la plateforme pour un appareil et un compte. Il revalide toutes les 24 heures ; sans validation pendant sept jours il passe en mode restreint : ce qui tourne continue, les commandes de l'app ne répondent plus.

Pourquoi : un binaire copié ailleurs n'a pas de jeton ; l'app reste utilisable si la plateforme tombe ; le client qui arrête de payer garde sa machine intacte.
